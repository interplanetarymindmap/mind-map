import { Pt, Group, Circle, Rectangle, Util, World, Particle, UIButton, UI } from 'pts';
import PtsCanvas from "./PtsCanvas.jsx"
import Converter from "./Converter.js"
import React, { Component } from 'react'
import NodeType from './NodeType'
import Shape from './Shape'
import Paint from './Paint'
import Burl from './Burl'
import Now from './Now'
import BurlSelection from './BurlSelection';

export default class IPLDReodeder extends PtsCanvas {

    constructor(props) {
        super(props);

        this.world = null
        this.nodes = {}
        this.pts = {}
        this.burls = {}//a global index of burls cid:{pt,nodes[nid1,nid2],contentPreview}

        this.borningNode = new Pt(0, 0)

        this.selectedId = null
        this.selectedRelation = undefined
        this.selectedIdHistory = []
        this.paint = {}
        this.background = null

        document.onkeydown = this.checkKey.bind(this)
        this.onCanvasReady = this.onCanvasReady.bind(this)
        this.onBurlDown = this.onBurlDown.bind(this)
        this.onBurlUp = this.onBurlUp.bind(this)
        this.onBurlHover = this.onBurlHover.bind(this)
        this.onBurlLeave = this.onBurlLeave.bind(this)
        this.onBurlMove = this.onBurlMove.bind(this)

        this.setIpfs()

        this._ptsToDraw = []
    }

    componentWillReceiveProps(nextProps) {
        if (nextProps.zoom)
            this.onZoomChange(nextProps.zoom)

        if (JSON.stringify(nextProps.cids) === JSON.stringify(this.props.cids))
            return

        if (this.props.ipfs.isOnline()) {
            this.setCids(nextProps.cids)
        }
        else {
            console.warn("IPFS not ready yet")
        }
    }

    componentDidUpdate(prevProps) {
        this.checkPause()
    }

    onCanvasReady() {
        this.paint = new Paint(this.form)
    }

    setIpfs() {
        if (!this.props.ipfs) throw (new Error('No IPFS object'))
        let that = this
        this.props.ipfs.on('start', () => {
            that.onIpfsReady(that.props.ipfs)
        })

        if (this.props.ipfs.isOnline())
            this.onIpfsReady()
    }

    onIpfsReady() {
        this.setCids(this.props.cids)
    }

    setCids(cids) {
        for (let cid of cids) {
            if (!this.pts[cid])
                this.loadCID(cid)
        }
    }

    loadCID(cid) {

        //We display the cid right away
        this.newBurl(cid)
        //we try to load its content as a dag
        this.props.ipfs.dag.get(cid, (error, result) => {
            if (error) {
                console.warn("props.ipfs.dag.get", cid, error)
                return
            }

            let data = result.value
            //NodeTypes is a mindmap node type
            if (NodeType.isNode(data)) {
                this.newNode(data, cid)
            }
            else {
                this.props.ipfs.files.cat(cid, (error, file) => {
                    if (error) {
                        console.warn("ipfs.files.cat...", cid, error)
                        return
                    }
                    this.burls[cid].file = file
                })
            }
        })
    }

    newBurl(oid) {
        //Remove node burls will try to be created again
        if (this.nodes[oid])
            return

        if (this.burls[oid])
            return

        if (this.pts[oid])
            return

        let pt = this.addNewPtParticle(oid)

        this.pts[oid] = pt

        let b = new Burl(oid, pt)
        this.burls[oid] = b

        let btn = b.setInteraction(this.onBurlDown, this.onBurlUp, this.onBurlHover, this.onBurlLeave, this.onBurlMove)

        console.log('Created burl', oid)

        return b
    }

    addNewPtParticle(oid) {
        let initPt = Shape.randomPt(this.space.center)
        let particle = new Particle(initPt).size(Now.originRadius() + Now.nodeArm());
        particle.id = oid // this is so we can retreive it later on
        this.world.add(particle, oid)
        return particle
    }

    newNode(data, nid) {
        if (this.nodes[nid])
            return


        let n = new NodeType(data)
        this.nodes[nid] = n

        let oid = n.origin.link
        this.loadCID(oid)

        let targets = n.targetCids
        for (let tid of targets) {
            this.loadCID(tid)
        }

        this.burls[oid].addNode(n)

        //previosly created burl before node was loaded
        this.removeBurl(nid)
    }

    removeBurl(oid) {
        //return
        if (Now.upSelection && Now.upSelection.burl.oid === oid)
            Now.upSelection = null
        if (Now.hoverSelection && Now.hoverSelection.burl.oid === oid)
            Now.hoverSelection = null
        if (Now.downSelection && Now.downSelection.burl.oid === oid)
            Now.downSelection = null

        this.getParticleIndex()

        delete this.burls[oid]
        this.world.remove('particle', this.getParticleIndex(oid))
        delete this.pts[oid]

        /*
        console.log('Particle Index', this.getParticleIndex(oid))

        console.log('Nodes')
        this.toAll(this.nodes, (obj, cid) => { console.log('   ', cid) })

        console.log('Burls')
        this.toAll(this.burls, (a, id) => { console.log('   ', id) })

        console.log('Pts')
        this.toAll(this.pts, (a, id) => { console.log('   ', id) })

        console.log("Removed", oid)
        */
    }

    getParticleIndex(pid) {
        for (let i = 0; i < this.world.particleCount; i++) {
            if (this.world.particle(i).id === pid) {
                return i
            }
        }
        return -1
    }

    onBurlDown(pt, burl) {
        Now.hoverSelection = this.getBurlSelection(pt, burl)
        Now.downSelection = Now.hoverSelection
    }

    onBurlUp(pt, burl) {
        Now.hoverSelection = this.getBurlSelection(pt, burl)
        Now.upSelection = Now.hoverSelection
        this.checkBorningRelation()
    }

    onBurlHover(pt, burl) {
        Now.hoverSelection = this.getBurlSelection(pt, burl)
    }

    onBurlLeave(pt, burl) {
        Now.hoverSelection = null
    }

    onBurlMove(pt, burl) {
        Now.hoverSelection = this.getBurlSelection(pt, burl)
    }

    getBurlSelection(pointer, burl) {

        let closest = this.getClosestNodeRelationToPointer(pointer, burl)
        let nearbyNode = closest.node
        let nodeDistance = closest.distance
        if (nodeDistance === null) {
            return new BurlSelection(burl, null)
        }
        else {
            let originDistance = pointer.$subtract(burl.pt).magnitude()
            if (originDistance <= nodeDistance) {
                return new BurlSelection(burl, null)
            }
            else {
                return new BurlSelection(burl, nearbyNode)
            }
        }
    }

    getClosestNodeRelationToPointer(pointer, burl) {
        let closestNode = null
        let closestDistance = null

        for (let n of burl.nodes) {
            for (let r of n.relations) {
                let line = new Group(burl.pt, this.pts[r.target.link])
                let circle = Circle.fromCenter(burl.pt, Now.nodeRadius())
                let pts = Circle.intersectLine2D(circle, line)
                for (let pt of pts) {
                    let distance = pointer.$subtract(pt).magnitude()

                    if (closestDistance == null) {
                        closestDistance = distance
                        closestNode = n
                    }
                    else {
                        if (distance < closestDistance) {
                            closestDistance = distance
                            closestNode = n
                        }
                    }
                }
            }
        }
        return { node: closestNode, distance: closestDistance }
    }

    paintPt(pt) {
        this._ptsToDraw.push(pt)
    }

    onZoomChange(zoom) {
        Now.setZoom(zoom)
        this.toAll(this.pts, (pt) => { pt.radius = Now.nodeArm() })
    }

    checkPause() {
        if (this.props.pause) {
            this.space.pause();

        } else {
            this.space.resume();
        }
    }

    start(space, bound) {
        this.world = new World(this.space.innerBound, 0.7, new Pt(0, 0));
    }

    resize() {
        //this.create();
    }


    addForces(n) {

        for (let r of n.relations) {
            //targetPt
            let tpt = this.pts[r.target.link]
            //the attraction force will be proporcional to its distance
            let oid = n.origin.link
            if (!this.pts[oid])
                return

            let opt = this.pts[oid]

            let forceAmount = 2
            let distance = opt.$subtract(tpt)
            //negative so it attracts
            let force = distance.$multiply(-1 * forceAmount)
            opt.addForce(force)
            //oposite force is added to the destination pt
            tpt.addForce(force.multiply(-1))
        }
    }

    drawRelations(n) {
        let lineColor = "#999"
        for (let r of n.relations) {
            let opt = this.pts[n.origin.link]
            let tpt = this.pts[r.target.link]
            this.paint.arrow(opt, tpt, Now.originRadius(), lineColor)
        }
    }

    drawBurl(b) {
        //node bubble
        if (b.nodes.length) {
            this.paint.bubble(b.pt, Now.nodeRadius(), '#EA967455')
        }
        //preview bubble
        if (b.hasPreview) {
            this.paint.bubble(b.pt, Now.originRadius(), '#FCBC8055')
            this.paint.text(b.preview, b.pt, Now.originRadius() * 1.5, '#8B4B62')
        }
        //cid bubble
        else {
            this.paint.bubble(b.pt, Now.originRadius(), '#F7E29C55')
            this.paint.text(b.oid, b.pt, Now.originRadius() * 1.5, '#BB6F6B88', false)
        }
    }

    paintHighlights() {
        if (Now.downSelection) {
            if (Now.downSelection.node)
                this.paint.bubbleOutline(Now.downSelection.burl.pt, Now.nodeRadius(), '#f36')
            else
                this.paint.bubbleOutline(Now.downSelection.burl.pt, Now.originRadius(), '#f36')
        }

        if (Now.hoverSelection) {
            if (Now.hoverSelection.node)
                this.paint.bubbleOutline(Now.hoverSelection.burl.pt, Now.nodeRadius(), '#f365')
            else
                this.paint.bubbleOutline(Now.hoverSelection.burl.pt, Now.originRadius(), '#f365')
        }
    }

    animate(time, ftime) {
        this.world.update(ftime)
        this.toAll(this.nodes, this.addForces.bind(this))
        this.toAll(this.nodes, this.drawRelations.bind(this))
        this.toAll(this.burls, this.drawBurl.bind(this))
        this.paintBorningNode()
        this.paintBorningRelation()
        this.paintHighlights()

        this.world.drawParticles((p, i) => { this.form.fillOnly('#00f5').point(p, 10, "circle") });

        for (let pt of this._ptsToDraw)
            this.paint.bubble(pt, 10, '#f36')
        this._ptsToDraw = []
    }

    toAll(obj, fnc) {
        for (let cid in obj) {
            if (!obj.hasOwnProperty(cid))
                continue
            fnc(obj[cid], cid)
        }
    }

    checkBorningRelation() {
        if (!Now.downSelection || !Now.upSelection)
            return

        if (Now.downSelection.burl.oid === Now.upSelection.burl.oid)
            return

        //We assume only one relation per target and no type, for now
        if (Now.downSelection.node && Now.downSelection.node.hasTarget(Now.upSelection.burl.oid))
            return

        this.createRelation(Now.downSelection, Now.upSelection)
    }

    createRelation(originSelection, targetSelection) {
        if (originSelection.node) {
            //We assume only one relation per target and no type, for now
            if (originSelection.node.hasTarget(targetSelection.burl.oid)) {
                consoe.log('target exists')
            }
            else {
                console.log('target doesnt exists')
            }
        }
        let newNode = NodeType.getNewObj(originSelection.burl.oid, [targetSelection.burl.oid])
        this.props.onNewNode(newNode)

    }

    paintBorningNode() {
        if (this.props.borningNode) {
            this.paint.bubble(this.props.borningNode.pt, Now.originRadius(), '#ecd8')
            if (this.props.borningNode.text) {
                this.paint.text(this.props.borningNode.text, this.props.borningNode.pt, Now.originRadius() * 2)
            }
            else {
                this.paint.text("what's in your mind?", this.props.borningNode.pt, Now.originRadius() * 2, '#666')
            }
        }
    }

    paintBorningRelation() {
        if (!Now.isPressing)
            return
        if (!Now.downSelection)
            return

        let opt = Now.downSelection.burl.pt
        let tpt = this.space.pointer

        if (Now.hoverSelection)
            tpt = Now.hoverSelection.burl.pt

        this.paint.arrow(opt, tpt, 0, '#f36')
    }

    action(type, px, py) {
        Now.updateAction(type)
        this.toAll(this.burls, (burl, oid) => {
            UI.track([burl.btn], type, new Pt(px, py));
        })

    }

    selectNewId(newId) {
        if (!this.pts[newId])
            return

        if (this.selectedIdHistory[this.selectedIdHistory.length - 1] !== newId) {
            this.selectedIdHistory.push(newId)
        }
        this.selectedId = newId
        this.selectedRelation = null
    }

    selectPreviousId() {
        if (this.selectedRelation) {
            this.selectedRelation = null
            return
        }
        if (this.selectedIdHistory.length <= 1)
            return
        this.selectedIdHistory.pop()
        this.selectedId = this.selectedIdHistory[this.selectedIdHistory.length - 1]
    }

    selectNextRelation(jumps) {
        let currentN = this._nodes[this.selectedId]
        if (!currentN)
            return

        let currentIndex = this.getRelationIndex(currentN, this.selectedRelation)
        if (currentIndex === undefined) {
            if (currentN.relationships)
                this.selectedRelation = currentN.relationships[0].destinationNode
            return
        }

        let nextIndex = (currentIndex + jumps) % currentN.relationships.length
        if (nextIndex < 0)
            nextIndex = currentN.relationships.length + nextIndex
        let relationship = currentN.relationships[nextIndex]
        if (relationship)
            this.selectedRelation = relationship.destinationNode
    }

    getRelationIndex(n, tid) {
        return n.relations.findIndex((r) => {
            return r.link === tid
        })
    }

    checkKey(e) {

        e = e || window.event;

        if (e.keyCode === '38') {//up arrow
            this.selectNewId(this.selectedRelation)
        }
        else if (e.keyCode === '40') {// down arrow
            this.selectPreviousId()
        }
        else if (e.keyCode === '37') {// left arrow
            this.selectNextRelation(-1)

        }
        else if (e.keyCode === '39') {// right arrow
            this.selectNextRelation(1)
        }

    }

}
