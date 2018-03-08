const rp = require('request-promise')
const qs = require('qs')
const fs = require('fs')
const md5 = require('md5')

const LongPoll = require('./longpoll')
const BotLongPoll = require('./longpoll/bot')
const CallbackAPI = require('./callback-api')
const MessageConstructor = require('./messages/constructor')
const Upload = require('./upload')

const
    apiUrl = {
        protocol: 'https',
        domain: 'api.vk.com',
        path: 'method',
        version: '5.69'
    },
    apiPackedUrl = `${apiUrl.protocol}://${apiUrl.domain}/${apiUrl.path}`

module.exports = class API {
    constructor(token) {
        this.token = token || ''
        this.queries = []
        this.limit = 3
        this.rejection = true
        this.info = {}
        this._version = apiUrl.version
        this.errorHandler = () => {}
        this.upload = new Upload(this)

        Object.defineProperty(this, "longpoll", {
            enumerable: false,
            get: () => {
                if (!this.lp) {
                    this.lp = new LongPoll(this)
                }

                return this.lp
            }
        })

        Object.defineProperty(this, "bot", {
            enumerable: false,
            get: () => {
                if (!this.botlp) {
                    this.botlp = new BotLongPoll(this)
                }

                return this.botlp
            }
        })

        this.loadErrors('en')
    }

    version(version) {
        this._version = version.toString()

        return this
    }

    pack() {
        this.packer = !this.packer

        return this
    }

    lang(language) {
        this.language = language

        switch (language) {
            case 'ru':
            case 'en':
                {
                    this.loadErrors(language)

                    break
                }
        }

        return this
    }

    check(app_data = {}) {
        this.call('groups.getById')
            .then(response => {
                if (response.length) {
                    this.info = {
                        group_id: response[0].gid,
                        name: response[0].name,
                        screen_name: response[0].screen_name,
                        is_closed: response[0].is_closed,
                        type: response[0].type,
                        photo: {
                            origin: response[0].photo,
                            medium: response[0].photo_medium,
                            big: response[0].photo_big
                        }
                    }

                    this.resetInterval(20)
                }
            })
            .catch(error => {
                this.call('users.get')
                    .then(response => {
                        if (response.length) {
                            this.info = {
                                user_id: response[0].uid,
                                user: {
                                    first_name: response[0].first_name,
                                    last_name: response[0].last_name
                                }
                            }

                            this.resetInterval(3)
                        } else {
                            return false
                        }
                    })
                    .then(status => {
                        if (status) {
                            this.call('secure.getSMSHistory')
                                .then(response => {
                                    this.info = {}

                                    this.resetInterval(5)

                                    if (app_data) {
                                        if (app_data.id) {
                                            this.info = app_data.id
                                        }

                                        if (app_data.secret) {
                                            this.info = app_data.secret
                                        }

                                        if (app_data.users) {
                                            if (app_data.users >= 1e4 && app_data.users < 1e5) {
                                                this.resetInterval(8)
                                            } else if (app_data.users < 1e6) {
                                                this.resetInterval(20)
                                            } else {
                                                this.resetInterval(35)
                                            }
                                        }
                                    }
                                })
                                .catch(error => {})
                        }
                    })
            })

        return this
    }

    loadErrors(lang) {
        try {
            this.errors = JSON.parse(fs.readFileSync(`${__dirname}/../../assets/errors-${lang}.json`, 'UTF-8'))
        } catch (err) {
            console.error(err)
        }
    }

    setErrorHandler(rejection, handler) {
        this.errorHandler = handler
        this.rejection = rejection
    }

    resetInterval(limit) {
        if (limit == this.limit) {
            return
        }

        this.limit = limit

        if (this.interval instanceof setInterval) {
            clearInterval(this.interval)
        }

        this.interval = setInterval(() => this.checkQueue(), 1000 / this.limit)
    }

    async _call(method, params) {
        params.access_token = this.token
        params.v = this._version

        if (this.language) {
            params.lang = this.language
        }

        if (params instanceof Object) {
            for (const key in params) {
                if (Array.isArray(params[key])) {
                    params[key] = params[key].join(',')
                } else if (params[key] instanceof Object) {
                    try {
                        params[key] = JSON.stringify(params[key])
                    } catch (err) {
                        delete params[key]
                    }
                } else if (typeof params[key] == 'boolean') {
                    params[key] = params[key] ? 1 : 0
                } else if (params[key] === null || params[key] === undefined || params[key] === Infinity) {
                    delete params[key]
                }
            }
        }

        try {
            return await rp([apiPackedUrl, method].join('/'), {
                method: 'POST',
                formData: params,
                json: true
            })
        } catch (err) {
            throw err
        }
    }

    async call(method, params, callback) {
        if (!params) {
            params = {}
        }

        if (this.interval === undefined) {
            this.checkQueue()

            this.interval = setInterval(() => this.checkQueue(), 1000 / this.limit)
        }

        if (callback) {
            this.queries.push({
                method,
                params,
                callback
            })
        } else {
            return new Promise((resolve, reject) => {
                this.queries.push({
                    method,
                    params,
                    resolve,
                    reject
                })
            })
        }
    }

    createError(error) {
        if (typeof this.errors == 'object' && this.errors.length) {
            this.errors.forEach((object) => {
                switch (object.code) {
                    case 100:
                        {
                            return
                        }
                }

                if (object.code == error.error_code) {
                    error.error_msg = object.text

                    if (object.solution) {
                        error.solution = object.solution
                    }

                    return
                }
            })
        }

        const err = new Error(error.error_msg)

        if (error.solution) {
            err.message = error.solution
        }

        err.code = error.error_code

        if (error.captcha_sid && error.captcha_img) {
            err.captcha = {
                sid: error.captcha_sid,
                img: error.captcha_img
            }
        }

        if (error.request_params) {
            err.request_params = error.request_params
        }

        throw err
    }

    checkQueue() {
        if (!this.queries.length) {
            clearInterval(this.interval)

            delete this.interval

            return
        }

        if (this.packer) {
            const operations = this.queries.splice(0, 25)

            let packedOperations = []

            operations.forEach(operation => packedOperations.push(
                `API.${operation.method}(${JSON.stringify(operation.params)})`
            ))

            packedOperations = `return [${packedOperations.join(',')}];`

            return this._exec(packedOperations, operations)
        }

        const methodCall = this.queries.shift()

        this._exec(methodCall)
    }

    async _exec(methodCall, operations) {
        let isPacked, _methodCall

        try {
            if (typeof methodCall == 'string') {
                isPacked = true
            }

            let { response, error, execute_errors } = await this._call(isPacked ? 'execute' : methodCall.method, isPacked ? {
                code: methodCall
            } : methodCall.params)

            if (error) {
                this.createError(error)
            }

            if (isPacked) {
                if (typeof response == 'object') {
                    response.forEach(resp => {
                        _methodCall = operations.shift()

                        if (resp === false) {
                            if (execute_errors[0]) {
                                this.createError(execute_errors.shift())

                                return
                            }
                        }

                        if (_methodCall.callback) {
                            _methodCall.callback(resp)
                        } else if (_methodCall.resolve && _methodCall.reject) {
                            _methodCall.resolve(resp)
                        }
                    })
                }

                return
            }

            if (methodCall.callback) {
                methodCall.callback(response)
            } else if (methodCall.resolve && methodCall.reject) {
                methodCall.resolve(response)
            }
        } catch (err) {
            try {
                this.errorHandler(err)
            } catch (err) {
                console.error(err)

                this.errorHandler = () => {}
            }

            if (this.rejection) {
                if (isPacked && _methodCall) {
                    _methodCall.reject(err)

                    return
                }

                if (methodCall && typeof methodCall == 'object') {
                    if (methodCall.reject) {
                        methodCall.reject(err)
                    } else {
                        throw err
                    }
                }
            }
        }
    }

    async execute(code, callback) {
        return await this.call('execute', { code }, callback)
    }

    async procedure(name, args, callback) {
        return await this.call(`execute.${name}`, args, callback)
    }

    callback(config) {
        return new CallbackAPI(config)
    }

    messagesProc(inboundProcessing) {
        this.messageProcessing = true

        if (inboundProcessing) {
            this.inboundProcessing = true
        }

        return this
    }

    message(text = '') {
        return new MessageConstructor(text, this)
    }
}