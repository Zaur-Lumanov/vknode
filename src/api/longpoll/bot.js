const EventEmitter = require('events')
const rp = require('request-promise')

const Message = require('../messages/message')

const wait = 25

module.exports = class BotLongPoll extends EventEmitter {
    constructor(self) {
        super()

        this.self = self

        this.updateServer()
    }

    async updateServer() {
        const response = await this.self.call('groups.getById')

        if (!response) {
            throw new Error('Invalid group')
        }

        this.self.call('groups.getLongPollServer', {
            group_id: response[0].id
        }).then(response => {
            this.key = response.key
            this.server = response.server
            this.ts = response.ts

            this.update()
        }).catch(console.error)
    }

    async update() {
        try {
            const { failed, ts, updates } = await rp(`${this.server}`, {
                qs: {
                    act: 'a_check',
                    key: this.key,
                    ts: this.ts,
                    wait
                },
                json: true
            })

            switch (failed) {
                case 1:
                    {
                        this.ts = ts

                        return this.update()
                    }
                case 2:
                case 3:
                    return this.updateServer()
                case 4:
                    throw new Error('LongPoll error: Invalid version number was passed in the version parameter.')
            }

            this.ts = ts

            updates.forEach((update) => {
                if ((update.type == "message_new" || update.type == "message_reply" || update.type == "message_edit") && this.self.messageProcessing) {
                    update.object = new Message(update.object, this.self)
                }

                this.emit(update.type, update.object, update.group_id)
            })

            this.update()
        } catch (error) {
            if (error.statusCode) {
                return this.updateServer()
            }

            console.error(error)
        }
    }
}