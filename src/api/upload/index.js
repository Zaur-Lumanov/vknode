const fs = require('fs')
const request = require('request')
const rp = require('request-promise')

// https://vk.com/dev/upload_files

module.exports = class Upload {
    constructor(self) {
        this.self = self
        this.cache = []
    }

    async _file(file) {
        if (file instanceof fs.ReadStream) {
            return file
        } else if (typeof file == 'string' && file.match(/https?:\/\/.+/i)) {
            let filename = file.split('/')

            filename = `${__dirname}/../../../cache/${filename[filename.length - 1]}`

            this.cache.push(filename)

            return new Promise(async(resolve, reject) => {
                request(file).pipe(fs.createWriteStream(filename)).on('finish', () => {
                    return resolve(fs.createReadStream(filename))
                })
            })
        }

        file = fs.createReadStream(file)

        return file
    }

    _clearCache() {
        this.cache.forEach(filename => fs.unlink(filename))
    }

    async photo(data = {}) {
        const
            owner_id = data.owner_id ? data.owner_id : (data.user_id ? data.user_id : (data.group_id ? 0 - data.group_id : (this.self.info.group_id ? 0 - this.self.info.group_id : this.self.info.user_id))),
            files = {}

        if (!data.album) {
            const { items } = await this.self.call('photos.getAlbums', { owner_id })

            data.album = items[0].id
        }

        const group_id = owner_id < 0 ? 0 - owner_id : null

        const { upload_url, album_id, user_id } = await this.self.call('photos.getUploadServer', {
            album_id: data.album,
            group_id
        })

        if (Array.isArray(data.photos)) {
            data.photos.forEach(async(photo) => {
                files[`file${Object.keys(files).length+1}`] = await this._file(photo)
            })
        } else if (data.photos) {
            files[`file${Object.keys(files).length+1}`] = await this._file(data.photos)
        }

        if (data.photo) {
            files[`file${Object.keys(files).length+1}`] = await this._file(data.photo)
        }

        const response = await rp(upload_url, {
            method: 'POST',
            formData: files,
            json: true
        })

        const photos = await this.self.call('photos.save', {
            server: response.server,
            photos_list: response.photos_list,
            hash: response.hash,
            album_id,
            latitude: data.latitude,
            longitude: data.longitude,
            caption: data.caption || data.text || data.body,
            group_id
        })

        if (photos) {
            for (const key in photos) {
                photos[key].attachment = `photo${photos[key].owner_id}_${photos[key].id}`
            }
        }

        return photos
    }

    async wallPhoto(data) {
        const group_id = data.group_id

        const { upload_url, album_id, user_id } = await this.self.call('photos.getWallUploadServer', { group_id })

        const response = await rp(upload_url, {
            method: 'POST',
            formData: {
                photo: await this._file(data.photo)
            },
            json: true
        })

        const [photo] = await this.self.call('photos.saveWallPhoto', {
            server: response.server,
            photo: response.photo,
            hash: response.hash,
            user_id: group_id ? null : group_id,
            group_id,
            latitude: data.latitude,
            longitude: data.longitude,
            caption: data.caption || data.text || data.body
        })

        photo.attachment = `photo${photo.owner_id}_${photo.id}`

        if (photo.access_key) {
            photo.attachment += `_${photo.access_key}`
        }

        return photo
    }

    async ownerPhoto(data) {
        const { upload_url } = await this.self.call('photos.getOwnerPhotoUploadServer', { owner_id: data.group_id ? 0 - data.group_id : null })

        const response = await rp(upload_url, {
            method: 'POST',
            formData: {
                photo: await this._file(data.photo)
            },
            json: true
        })

        const photo = await this.self.call('photos.saveOwnerPhoto', response)

        if (photo.post_id) {
            const owner_id = (data.group_id ? 0 - data.group_id : null) || (await this.self.call('users.get'))[0].id

            photo.post = `wall${owner_id}_${photo.post_id}`
        }

        return photo
    }

    async messagePhoto(data) {
        const { upload_url, album_id, user_id } = await this.self.call('photos.getMessagesUploadServer', { peer_id: data.peer_id })

        const response = await rp(upload_url, {
            method: 'POST',
            formData: {
                photo: await this._file(data.photo)
            },
            json: true
        })

        const [photo] = await this.self.call('photos.saveMessagesPhoto', response)

        photo.attachment = `photo${photo.owner_id}_${photo.id}`

        return photo
    }

    async chatPhoto(data) {
        const { upload_url } = await this.self.call('photos.getChatUploadServer', {
            chat_id: data.chat_id,
            crop_x: data.crop_x || data.x,
            crop_y: data.crop_y || data.y,
            crop_width: data.crop_width || data.width
        })

        const { response } = await rp(upload_url, {
            method: 'POST',
            formData: {
                file: await this._file(data.photo)
            },
            json: true
        })

        const info = await this.self.call('messages.setChatPhoto', { file: response })

        return info
    }

    async marketPhoto(data) {
        const { upload_url } = await this.self.call('photos.getChatUploadServer', {
            group_id: data.group_id,
            main_photo: data.main_photo || data.main,
            crop_x: data.crop_x || data.x,
            crop_y: data.crop_y || data.y,
            crop_width: data.crop_width || data.width
        })

        const response = await rp(upload_url, {
            method: 'POST',
            formData: {
                file: await this._file(data.photo)
            },
            json: true
        })

        response.group_id = data.group_id

        const [photo] = await this.self.call('photos.saveMarketPhoto', response)

        return photo
    }

    productPhoto(...data) {
        return this.marketPhoto(...data)
    }

    async marketAlbumPhoto(data) {
        const { upload_url } = await this.self.call('photos.getMarketAlbumUploadServer', { group_id: data.group_id })

        const response = await rp(upload_url, {
            method: 'POST',
            formData: {
                file: await this._file(data.photo)
            },
            json: true
        })

        response.group_id = response.gid

        delete response.gid

        const [photo] = await this.self.call('photos.saveMarketAlbumPhoto', response)

        return photo
    }

    async audio(data) {
        const { upload_url } = await this.self.call('audio.getUploadServer')

        const file = await this._file(data.file || data.audio || data.track)

        const response = await rp(upload_url, {
            method: 'POST',
            formData: { file },
            json: true
        })

        delete response.redirect

        response.artist = data.artist
        response.title = data.title === true ? (() => {
            file.path = file.path.split('/')

            return file.path[file.path.length - 1]
        })() : data.title

        const audio = await this.self.call('audio.save', response)

        return audio
    }

    async video(data) {
        const video = await this.self.call('video.save', {
            name: data.name,
            description: data.description || data.desc || data.descr,
            is_private: Boolean(data.is_private || data.private),
            wallpost: Boolean(data.wallpost || data.wall),
            link: data.link || data.href || data.src || data.source,
            group_id: data.group_id,
            album_id: data.album_id,
            privacy_view: typeof data.privacy_view == 'string' ? data.privacy_view : (Array.isArray(data.privacy_view) ? JSON.stringify(data.privacy_view) : null),
            privacy_comment: typeof data.privacy_comment == 'string' ? data.privacy_comment : (Array.isArray(data.privacy_comment) ? JSON.stringify(data.privacy_comment) : null),
            no_comments: Boolean(data.no_comments),
            repeat: Boolean(data.repeat)
        })

        const requestData = [video.upload_url, {
            method: 'POST',
            formData: {
                video_file: await this._file(data.file || data.video)
            },
            json: true
        }]

        let upload

        if (data.wait) {
            upload = await rp(...requestData)

            if (upload) {
                Object.assign(video, upload)
            }
        } else {
            rp(...requestData)
        }

        delete video.upload_url

        video.attachment = `video${video.owner_id}_${video.video_id}`

        if (video.access_key) {
            video.attachment += `_${video.access_key}`
        }

        return video
    }

    async _doc(data) {
        const file = await this._file(data.file)

        const params = {
            type: data.type /* doc, audio_message, graffiti */
        }

        const { upload_url } = await this.self.call(`docs.${data.method}`, params)

        const response = await rp(upload_url, {
            method: 'POST',
            formData: { file },
            json: true
        })

        const [doc] = await this.self.call('docs.save', {
            file: response.file,
            title: data.title === true ? (() => {
                file.path = file.path.split('/')

                return file.path[file.path.length - 1]
            })() : data.title,
            tags: typeof data.tags == 'string' ? data.tags : (Array.isArray(data.tags) ? data.tags.replace(/,/, '\\,').join(',') : null)
        })

        doc.attachment = `doc${doc.owner_id}_${doc.id}`

        if (doc.access_key) {
            doc.attachment += `_${doc.access_key}`
        }

        return doc
    }

    doc(data) {
        return this._doc({
            method: 'getUploadServer',
            group_id: data.group_id,
            title: data.data,
            tags: data.tags,
            file: data.file || data.doc
        })
    }

    wallDoc(data) {
        return this._doc({
            method: 'getWallUploadServer',
            group_id: data.group_id,
            title: data.data,
            tags: data.tags,
            file: data.file || data.doc
        })
    }

    messageDoc(data) {
        return this._doc({
            method: 'getMessagesUploadServer',
            peer_id: data.peer_id || data.user_id || (data.group_id ? 0 - data.group_id : (data.chat_id ? 2e9 + data.chat_id : null)),
            title: data.data,
            tags: data.tags,
            file: data.file || data.doc
        })
    }

    docs(...data) {
        return this.doc(...data)
    }

    wallDocs(...data) {
        return this.wallDoc(...data)
    }

    messageDocs(...data) {
        return this.messageDoc(...data)
    }

    async cover(data) {
        const { upload_url } = await this.self.call('photos.getOwnerCoverPhotoUploadServer', {
            group_id: data.group_id,
            crop_x: data.crop_x || data.x,
            crop_y: data.crop_y || data.y,
            crop_x2: data.crop_x2 || data.x2,
            crop_y2: data.crop_y2 || data.y2
        })

        const response = await rp(upload_url, {
            method: 'POST',
            formData: {
                photo: await this._file(data.photo || data.cover || data.file)
            },
            json: true
        })

        const photo = await this.self.call('photos.saveOwnerCoverPhoto', response)

        return photo
    }

    ownerCover(...data) {
        return this.cover(...data)
    }

    async story(data) {
        const type = 0 // dbg

        const { upload_url, user_ids } = await this.self.call(type === 0 ? 'stories.getPhotoUploadServer' : 'stories.getVideoUploadServer', {
            user_ids: data.user_ids,
            mask_id: data.mask_id,
            section_id: data.section_id,
            add_to_news: Boolean(data.add_to_news || data.news),
            reply_to_story: data.reply_to_story,
            link_text: data.link_text,
            link_url: data.link_url
        })

        const { response, error } = await rp(upload_url, {
            method: 'POST',
            formData: {
                [type === 0 ? 'photo' : 'video_file']: await this._file(data.file || type === 0 ? data.photo : data.video || data.video_file)
            },
            json: true
        })

        if (error) {
            return error
        }

        response.story.attachment = `story${response.story.owner_id}_${response.story.id}`

        if (response.story.access_key) {
            response.story.attachment += `_${response.story.access_key}`
        }

        return response.story
    }
}