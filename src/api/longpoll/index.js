const EventEmitter = require('events')
const rp = require('request-promise')

const Message = require('../messages/message')

const wait = 25
const mode = 2 + 8 + 32 + 64 + 128
const version = 2

const extraFields = ['peer_id', 'timestamp', 'text', 'attachments', 'random_id']
const eventStruct = {
    1: ['message_id', 'flags', ...extraFields],
    2: ['message_id', 'mask', ...extraFields],
    3: ['message_id', 'mask', ...extraFields],
    4: ['message_id', 'flags', ...extraFields],
    5: ['message_id', 'mask', 'peer_id', 'timestamp', 'new_text', 'attachments'],
    6: ['peer_id', 'local_id'],
    7: ['peer_id', 'local_id'],
    8: ['user_id', 'extra', 'timestamp'],
    9: ['user_id', 'flags', 'timestamp'],
    10: ['peer_id', 'mask'],
    11: ['peer_id', 'flags'],
    12: ['peer_id', 'mask'],
    13: ['peer_id', 'local_id'],
    14: ['peer_id', 'local_id'],
    51: ['chat_id', 'self'],
    61: ['user_id', 'flags'],
    62: ['user_id', 'chat_id'],
    70: ['user_id', 'call_id'],
    80: ['count'],
    114: ['peer_id', 'sound', 'disabled_until']
}
const flags = {
    UNREAD: 1,
    OUTBOX: 2,
    REPLIED: 4,
    IMPORTANT: 8,
    CHAT: 16,
    FRIENDS: 32,
    SPAM: 64,
    DELЕTЕD: 128,
    FIXED: 256,
    MEDIA: 512,
    HIDDEN: 65536
}
const dFlags = {
    IMPORTANT: 1,
    UNANSWERED: 2
}

module.exports = class LongPoll extends EventEmitter {
    constructor(self) {
        super()

        self.flags = flags
        this.self = self

        this.updateServer()
    }

    updateServer() {
        this.self.call('messages.getLongPollServer', {
            lp_version: 2
        }).then(response => {
            this.key = response.key
            this.server = response.server
            this.ts = response.ts

            this.update()
        }).catch(console.error)
    }

    async update() {
        try {
            const { failed, ts, updates } = await rp(`https://${this.server}`, {
                qs: {
                    act: 'a_check',
                    key: this.key,
                    ts: this.ts,
                    wait,
                    mode,
                    version
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
                const
                    eventID = update.shift().toString(),
                    params = {}

                if (this.eventNames().indexOf(eventID) !== -1) {
                    for (const key in update) {
                        params[eventStruct[eventID][key]] = update[key]
                    }

                    if (eventID == 4 && this.self.messageProcessing) {
                        const message = new Message(params, this.self)

                        if (this.self.inboundProcessing) {
                            if (message.check(flags.OUTBOX)) {
                                return
                            }
                        }

                        return this.emit(eventID, message)
                    }

                    this.emit(eventID, params)
                }
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