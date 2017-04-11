import { intersection, uniq } from 'lodash';

export interface Face {
  infinite: boolean;
  incidentEdge?: HalfEdge;
}

export interface HalfEdge {
  origin: Vertex;
  twin?: HalfEdge;
  // next is the next half edge traveling along the face
  // prev is the previous half edge traveling along the face
  next?: HalfEdge;
  prev?: HalfEdge;
  incidentFace?: Face;
}

export interface Vertex {
  x: number,
  y: number,
  colors?: Array<string>,
  incidentEdge?: HalfEdge;
}

// coordinate equality
let eq = (a: Vertex, b: Vertex) => (a.x === b.x && a.y === b.y);

// 2-dimensional cross product
const xProd = (v1: Vertex, v2: Vertex) => (v1.x * v2.y - v1.y * v2.x);

// dot product
const dot = (v1: Vertex, v2: Vertex) => (v1.x * v2.x + v1.y + v2.y);

// Do the line segments from v1-v2 and v3-v4 intersect?
export const intersect = (v1: Vertex, v2: Vertex, v3: Vertex, v4: Vertex, halfOpen: boolean = false) => {
  let r = { x: v2.x - v1.x, y: v2.y - v1.y };
  let s = { x: v4.x - v3.x, y: v4.y - v3.y };
  let diff = { x: v3.x - v1.x, y: v3.y - v1.y };
  let det = xProd(r, s);
  if (det !== 0) {
    let t = xProd(diff, r)/det;
    let u = xProd(diff, s)/det;
    let interior = (x: number) => (0 < x && x < 1);
    let boundary = (x: number) => (x === 0 || x === 1);
    if (interior(t) && interior(u)) {
      // the segments intersect
      return true;
    } else if (boundary(t) || boundary(u)) {
      // three points are collinear
      return (interior(t) || interior(u)) && (!halfOpen || t === 0 || u === 0);
    } else {
      return false;
    }
  } else {
    if (xProd(diff, r) !== 0) {
      // parallel, non-collinear
      return false;
    } else {
      // all 4 points collinear
      let t0 = dot(diff, r)/dot(r, r);
      let t1 = t0 + dot(s, r)/dot(r, r);
      return (Math.max(t0, t1) > 0 && Math.min(t0, t1) < 1);
    }
  }
}

// Is v in the interior of polygon?
export const inInterior = (polygon: Array<Vertex>, v: Vertex) => {
  if (polygon.length < 3) return false;
  let maxX = Math.max(...polygon.map(v => v.x));
  let maxY = Math.max(...polygon.map(v => v.y));
  let outerVertex = { x: maxX + 1, y: maxY + 1 };
  let crossingNum = 0;
  polygon.map((v, i, p) => ([v, p[(i+1)%p.length]])).forEach(pair => {
    if (intersect(v, outerVertex, pair[0], pair[1], true)) crossingNum += 1;
  })
  return crossingNum % 2 === 1;
}

export const isClockwise = (polygon: Array<Vertex>) => {
  let signedAreaSum = 0;
  polygon.map((v, i, p) => ([v, p[(i+1)%p.length]])).forEach(pair => {
    signedAreaSum += (pair[1].x - pair[0].x) * (pair[1].y + pair[0].y);
  })
  return (signedAreaSum > 0);
}

export class PlanarGraph {
  vertices: Array<Vertex>;
  edges: Array<HalfEdge>;
  infiniteFace: Face;
  faces: Array<Face>;

  constructor () {
    this.vertices = [];
    this.edges = [];
    this.infiniteFace = { infinite: true };
    this.faces = [this.infiniteFace];
    // bind methods
    this.addEdge = this.addEdge.bind(this);
    this.begin = this.begin.bind(this);
    this.commonFaces = this.commonFaces.bind(this);
    this.getBoundaryEdges = this.getBoundaryEdges.bind(this);
    this.getBoundingFace = this.getBoundingFace.bind(this);
    this.getIncidentFaces = this.getIncidentFaces.bind(this);
    this.getOutgoingEdges = this.getOutgoingEdges.bind(this);
  }

  addEdge(v1: Vertex, v2: Vertex) {
    if (!v1.incidentEdge && !v2.incidentEdge) {
      if (this.vertices.length > 0) throw new Error("Only one connected component!");
      this.begin(v1, v2);
      return true;
    } else if (!v1.incidentEdge && v2.incidentEdge) {
      return this.connectNewVertex(v2, v1);
    } else if (!v2.incidentEdge && v1.incidentEdge) {
      return this.connectNewVertex(v1, v2);
    } else {
      return this.connectVertices(v1, v2);
    }
  }

  begin(v1: Vertex, v2: Vertex) {
    this.vertices = [v1, v2];
    let v1v2: HalfEdge = { origin: v1, incidentFace: this.infiniteFace };
    let v2v1: HalfEdge = { origin: v2, prev: v1v2, next: v1v2, twin: v1v2, incidentFace: this.infiniteFace};
    v1.incidentEdge = v1v2;
    v2.incidentEdge = v2v1;
    v1v2.twin = v2v1;
    v1v2.prev = v2v1;
    v1v2.next = v2v1;
    this.edges = [v1v2, v2v1];
    this.infiniteFace.incidentEdge = v1v2;
  }

  connectNewVertex(oldVertex: Vertex, newVertex: Vertex) {
    if (newVertex.incidentEdge) throw new Error("Can't connect this vertex!");
    let boundingFace: Face | null = this.getEdgeFace(oldVertex, newVertex);
    if (boundingFace) {
      this.vertices.push(newVertex);
      let oldOutEdge = this.getBoundaryEdges(boundingFace).filter(e => e.origin === oldVertex)[0];
      let oldInEdge = oldOutEdge.prev;
      let oldNew: HalfEdge = { origin: oldVertex, prev: oldInEdge, incidentFace: boundingFace };
      let newOld: HalfEdge = { origin: newVertex, twin: oldNew, prev: oldNew, next: oldOutEdge, incidentFace: boundingFace };
      this.edges.push(oldNew);
      this.edges.push(newOld);
      oldNew.twin = newOld;
      oldNew.next = newOld;
      oldOutEdge.prev = newOld;
      oldInEdge.next = oldNew;
      newVertex.incidentEdge = newOld;
      return true;
    } else {
      return false;
    }
  }

  connectVertices(v1: Vertex, v2: Vertex) {
    let boundingFace: Face | null = this.getEdgeFace(v1, v2);
    if (boundingFace) {
      // 1. Fix the edge pointers to other edges
      let e1 = this.getBoundaryEdges(boundingFace).filter(e => e.origin === v1)[0];
      let e2 = this.getBoundaryEdges(boundingFace).filter(e => e.origin === v2)[0];
      let v1v2: HalfEdge = { origin: v1, next: e2, prev: e1.prev };
      let v2v1: HalfEdge = { origin: v2, next: e1, prev: e2.prev, twin: v1v2};
      v1v2.twin = v2v1;
      e1.prev.next = v1v2;
      e1.prev = v2v1;
      e2.prev.next = v2v1;
      e2.prev = v1v2;
      this.edges.push(v1v2);
      this.edges.push(v2v1);
      // 2. Split the face
      let newFaceEdge: HalfEdge = v2v1;
      let oldFaceEdge: HalfEdge = v1v2;
      if (boundingFace.infinite) {
        let vertices = [v1v2.origin];
        let currentEdge = v1v2.next;
        while (currentEdge !== v1v2) {
          vertices.push(currentEdge.origin);
          currentEdge = currentEdge.next;
        }
        if (!isClockwise(vertices)) {
          oldFaceEdge = v2v1;
          newFaceEdge = v1v2;
        }
      }
      boundingFace.incidentEdge = oldFaceEdge;
      let newFace: Face = { infinite: false, incidentEdge: newFaceEdge };
      this.faces.push(newFace);
      // 3. Fix incidentFace pointers
      oldFaceEdge.incidentFace = boundingFace;
      newFaceEdge.incidentFace = newFace;
      let currentEdge = newFaceEdge.next;
      while (currentEdge !== newFaceEdge) {
        currentEdge.incidentFace = newFace;
        currentEdge = currentEdge.next;
      }
      return true;
    } else {
      return false;
    }
  }

  getEdgeFace(v1: Vertex, v2: Vertex) {
    let midpoint = { x: (v1.x + v2.x)/2, y: (v1.y + v2.y)/2 };
    let possFace = this.getBoundingFace(midpoint);
    if (this.commonFaces(v1, v2).indexOf(possFace) > -1) {
      return this.getBoundaryEdges(possFace).every(e => (
        !intersect(v1, v2, e.origin, e.next.origin)
      )) ? possFace : null;
    } else {
      return null;
    }
  }

  commonFaces(v1: Vertex, v2: Vertex) {
    return intersection(...[v1, v2].map(this.getIncidentFaces));
  }

  getBoundaryEdges(f: Face) {
    let boundaryEdges = <Array<HalfEdge>>[];
    if (f.incidentEdge) {
      let currentEdge = f.incidentEdge;
      while (boundaryEdges.indexOf(currentEdge) === -1) {
        boundaryEdges.push(currentEdge);
        currentEdge = currentEdge.next;
      }
    }
    return boundaryEdges;
  }

  getBoundaryVertices(f: Face) {
    return this.getBoundaryEdges(f).map(e => e.origin);
  }

  getBoundingFace(v: Vertex) {
    let boundingFace = this.infiniteFace;
    this.faces.forEach((f: Face) => {
      if (!f.infinite &&
        inInterior(this.getBoundaryVertices(f), v)) {
          boundingFace = f;
        }
      });
    return boundingFace;
  }

  getIncidentFaces(v: Vertex) {
    return v.incidentEdge ?
      uniq(this.getOutgoingEdges(v).map((e: HalfEdge) => e.incidentFace)) :
      [this.getBoundingFace(v)];
  }

  getOutgoingEdges(v: Vertex) {
    let incidentEdges = <Array<HalfEdge>>[];
    if (v.incidentEdge) {
      let currentEdge = v.incidentEdge;
      while (incidentEdges.indexOf(currentEdge) === -1) {
        incidentEdges.push(currentEdge);
        currentEdge = currentEdge.twin.next;
      }
    }
    return incidentEdges;
  }
}
