import CID from 'cids'
const events = require('events')


export default class IpfsController extends events.EventEmitter {
    constructor() {
        super()
        this._isReady = false
        this._ipfs = null
    }

    init(ipfs) {

        if (!ipfs) {
            console.warn('No ipfs yet...')
            return
        }

        this._ipfs = ipfs

        this._ipfs.id().then((id) => {
            console.log('Peer id', id)

            if (this.isJsIpfs(id)) {

                if (this._ipfs.isOnline()) {
                    this.onIpfsReady()
                }
                else {
                    this.props.ipfs.on('start', () => {
                        this.onIpfsReady()
                    })
                }
            }
            else {
                this.onIpfsReady()
            }
        })
    }

    onIpfsReady() {
        this._isReady = true
        this.emit('ready')
    }

    get isReady() {
        return this._isReady
    }

    isJsIpfs(ipfsId) {
        if (ipfsId.agentVersion.indexOf('js') !== -1)
            return true
        return false
    }

    loadDag(cid, callback) {
        this._ipfs.dag.get(cid, (error, result) => {
            if (error) {
                console.warn("ipfs.dag.get", cid, error)
                callback(null, cid)
                return
            }

            let data = result.value
            callback(data, cid)
        })
    }

    loadFile(cid, callback) {
        this._ipfs.files.cat(cid, (error, file) => {

            if (error) {
                console.warn("ipfs.files.cat...", cid, error)
                return
            }

            callback(file)

        })
    }

    addIPLDObj(obj, callaback = () => { }) {
        this._ipfs.dag.put(obj, { format: 'dag-cbor', hashAlg: 'sha2-256' }, (error, result) => {
            if (error)
                throw (error)
            let cid = result.toBaseEncodedString()
            callaback(cid)
        })
    }

    getCodec(cidStr) {
        let cidObj = new CID(cidStr)
        return cidObj.codec
    }

    isDag(cid) {
        let codec = this.getCodec(cid)

        if (codec === 'dag-cbor' || codec === 'dag-pb')
            return true
        return false
    }


}
