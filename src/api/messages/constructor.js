module.exports = class MessageConstructor {
    constructor(text, self, peer, id) {
        this.__proto__.self = self
        this.__proto__.peer = peer
        this.__proto__.id = id
        this.__proto__.promise = []
        this.__proto__.wait = 0

        this.attachment = []
        this.forward_messages = []

        this.text(text)
    }

    _up() {
        ++this.__proto__.wait
    }

    _down() {
        --this.__proto__.wait

        if (this.wait === 0) {
            this._send()
                .then(this.promise[0])
                .catch(this.promise[1])
        }
    }

    text(text) {
        this.message = text.toString()

        return this
    }

    add(text) {
        return this.text(this.message + text)
    }

    body(text) {
        return this.text(text)
    }

    append(text) {
        return this.add(text)
    }

    photo(...photos) {
        photos.forEach(photo => {
            const vkPhoto = photo.match(/((?:photo)?-?\d+_\d+(?:_\w+)?)/im)

            if (vkPhoto) {
                this.attachment.push(vkPhoto[0])
            } else {
                this._up()
                this.self.upload.messagePhoto({
                    photo,
                    peer_id: this.peer
                }).then(data => {
                    this.attachment.push(data.attachment)
                    this._down()
                })
            }
        })

        return this
    }

    audio(...tracks) {
        tracks.forEach(audio => {
            const vkAudio = audio.match(/((?:audio)?-?\d+_\d+(?:_\w+)?)/im)

            if (vkAudio) {
                this.attachment.push(vkAudio[0])
            } else {
                this._up()
                this.self.upload.audio({
                    audio
                }).then(data => {
                    this.attachment.push(data.attachment)
                    this._down()
                })
            }
        })

        return this
    }

    wall(...posts) {
        posts.forEach(post => {
            const vkPost = post.match(/(post-?\d+_\d+(?:_\w+)?)/im)

            if (vkPost) {
                this.attachment.push(vkPost[0])
            }
        })

        return this
    }

    post(...posts) {
        return this.wall(...posts)
    }

    market(...products) {
        products.forEach(product => {
            const vkProduct = product.match(/(?:product|market)-?\d+_\d+(?:_\w+)?)/im)

            if (vkProduct) {
                this.attachment.push(vkProduct[0].replace(/product/, 'market'))
            }
        })

        return this
    }

    product(...products) {
        return this.market(...products)
    }

    video(...videos) {
        videos.forEach(video => {
            const vkVideo = video.match(/(video-?\d+_\d+(?:_\w+)?)/im)

            if (vkVideo) {
                this.attachment.push(vkVideo[0])
            } else {
                this._up()

                this.self.upload.video({
                    is_private: 1,
                    video,
                    wallpost: 0
                }).then(data => {
                    this.attachment.push(data.attachment)
                    this._down()
                }).catch(error => {
                    this.self.upload.video({
                        is_private: 1,
                        link: video
                    }).then(data => {
                        this.attachment.push(data.attachment)
                        this._down()
                    })
                })

            }
        })

        return this
    }

    docs(...docs) {
        docs.forEach(doc => {
            const vkDoc = doc.match(/(doc-?\d+_\d+(?:_\w+)?)/im)

            if (vkDoc) {
                this.attachment.push(vkDoc[0])
            } else {
                this._up()

                this.self.upload.messageDoc({
                    doc,
                    peer_id: this.peer
                }).then(data => {
                    this.attachment.push(data.attachment)
                    this._down()
                })

            }
        })

        return this
    }

    doc(...docs) {
        return this.docs(...docs)
    }

    graffiti(...docs) {
        docs.forEach(doc => {
            const vkDoc = doc.match(/(doc-?\d+_\d+(?:_\w+)?)/im)

            if (vkDoc) {
                this.attachment.push(vkDoc[0])
            } else {
                this._up()

                this.self.upload.messageDoc({
                    doc,
                    peer_id: this.peer,
                    type: 'graffiti'
                }).then(data => {
                    this.attachment.push(data.attachment)
                    this._down()
                })

            }
        })

        return this
    }

    graffity(...docs) {
        return this.graffiti(...docs)
    }

    voice(...docs) {
        docs.forEach(doc => {
            const vkDoc = doc.match(/(doc-?\d+_\d+(?:_\w+)?)/im)

            if (vkDoc) {
                this.attachment.push(vkDoc[0])
            } else {
                this._up()

                this.self.upload.messageDoc({
                    doc,
                    peer_id: this.peer,
                    type: 'audio_message'
                }).then(data => {
                    this.attachment.push(data.attachment)
                    this._down()
                })

            }
        })

        return this
    }

    attach(..._attachments) {
        this.attachment.push(..._attachments)

        return this
    }

    forwardMessages(...messages) {
        messages.forEach(_messages => {
            if (typeof _messages == 'number') {
                this.forward_messages.push(_messages)
            } else if (typeof _messages == 'object') {
                for (const key in _messages) {
                    this.forward_messages.push(_messages[key])
                }
            } else if (typeof _messages == 'string') {
                this.forward_messages.push(..._messages.split(','))
            }
        })

        return this
    }

    forward(...messages) {
        return this.forwardMessages(...messages)
    }

    fwd(...messages) {
        return this.forwardMessages(...messages)
    }

    reply() {
        return this.forwardMessages(this.id)
    }

    wait(ms) {
        this._up()

        setTimeout(() => {
            this._down()
        }, ms)

        return this
    }

    typing(ms) {
        this.__proto__.typing = ms

        return this
    }

    send() {
        this.peer_id = (arguments[0] ? (typeof arguments[0] != 'function' ? arguments[0] : null) : null) || this.peer

        return new Promise((reject, resolve) => {
            this.__proto__.promise = [reject, resolve]

            if (this.wait === 0) {
                this._send()
                    .then(this.promise.shift())
                    .catch(this.promise.shift())
            }
        })
    }

    async _send() {
        this.attachment = this.attachment.join(',')
        this.forward_messages = this.forward_messages.join(',')

        console.log(this.peer_id, this)

        return this.self.call('messages.send', this, typeof arguments[0] == 'function' ? arguments[0] : (typeof arguments[1] == 'function' ? arguments[1] : null))
    }
}