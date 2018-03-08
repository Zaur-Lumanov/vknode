const EventEmitter = require('events')
const bodyParser = require('body-parser')
const serverPoll = require('./server-poll')

module.exports = class CallbackAPI extends EventEmitter {
    constructor(config = {}) {
        super()

        config.port = process.env.VK_PORT || 8080

        this.path = config.path || '/'

        const app = serverPoll.get(config.port, this.path)

        app.use(bodyParser.json())
        app.use(function(error, req, res, next) {
            if (error) {
                res.status(400).end('invalid JSON data')
            }

            next()
        })
        app.post(this.path, (req, res) => this.incoming(req, res))

        serverPoll.listen(config.port)
    }

    incoming(req, res) {
        if (req.body.type) {
            this.emit(req.body.type, req.body.object, req.body.group_id)

            return res.status(200).end('ok')
        }

        return res.status(400).end('unknown event')
    }
}