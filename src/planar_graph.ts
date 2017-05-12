import { Coord, eq, intersect, inInterior, isClockwise, angle } from './geom';
import { intersection, find, uniq, forIn, values, cloneDeep, includes } from 'lodash';

export interface Face {
  infinite: boolean;
  incidentEdge?: string;
}

export interface HalfEdge {
  origin: string;
  twin?: string;
  // next is the next half edge traveling along the face
  // prev is the previous half edge traveling along the face
  next?: string;
  prev?: string;
  incidentFace?: string;
}

export interface Vertex extends Coord {
  colors?: Array<Color>;
  incidentEdge?: string;
}

export enum Color {
  Red,
  Orange,
  Yellow,
  Green,
  Blue
}

export const ALL_COLORS = [Color.Red, Color.Orange, Color.Yellow, Color.Green, Color.Blue];

interface HashMap<T> {
  [key: string]: T
}

export interface PlanarGraph {
  infiniteFace: string;
  mark1?: string;
  mark2?: string;
  vertices: HashMap<Vertex>;
  edges: HashMap<HalfEdge>;
  faces: HashMap<Face>;
}

// Effectful stuff

let slugCounter: number = 0;

const getSlug = () => {
  slugCounter = slugCounter + 1;
  return slugCounter + "";
}

export const createEmptyPlanarGraph = (): PlanarGraph => {
  let infFace: Face = { infinite: true };
  return {
    infiniteFace: 'infinite',
    vertices : {} as HashMap<Vertex>,
    edges: {} as HashMap<HalfEdge>,
    faces: { 'infinite': infFace } as HashMap<Face>
  } as PlanarGraph;
}

export const addEdge = (graph: PlanarGraph, c1: Coord, c2: Coord): PlanarGraph => {
  let vKey1 = getVertexKey(graph, c1);
  let vKey2 = getVertexKey(graph, c2);
  if (!vKey1 && !vKey2) {
    if (values(graph.vertices).length > 0) throw new Error("Please keep the graph connected");
    return begin(c1, c2);
  } else if (!vKey1 && vKey2) {
    return connectNewVertex(graph, vKey2, c1);
  } else if (!vKey2 && vKey1) {
    return connectNewVertex(graph, vKey1, c2);
  } else {
    return connect(graph, vKey1, vKey2);
  }
}

export const removeEdge = (graph: PlanarGraph, edgeKey: string): PlanarGraph => {
  let newGraph = cloneDeep(graph);
  let twinEdgeKey = newGraph.edges[edgeKey].twin;
  let keepFaceKey = newGraph.edges[edgeKey].incidentFace;
  let delFaceKey = newGraph.edges[twinEdgeKey].incidentFace;
  if (keepFaceKey !== delFaceKey) {
    let newFaceEdges = getBoundaryEdgeKeys(newGraph, delFaceKey);
    newGraph = removeEdgeFixOrigin(newGraph, edgeKey);
    newGraph = removeEdgeFixOrigin(newGraph, twinEdgeKey);
    delete newGraph.faces[delFaceKey];
    newFaceEdges.forEach(eKey => newGraph.edges[eKey].incidentFace = keepFaceKey);
    delete newGraph.edges[edgeKey];
    delete newGraph.edges[twinEdgeKey];
    return newGraph;
  } else {
    throw new Error("Please keep the graph connected");
  }
}

export const removeEdgeByVertices = (graph: PlanarGraph, c1: Coord, c2: Coord) => {
  let vKey1 = getVertexKey(graph, c1);
  let vKey2 = getVertexKey(graph, c2);
  let ourEdge = find(getOutgoingEdgeKeys(graph, vKey1), key =>
    (graph.edges[graph.edges[key].twin].origin === vKey2));
  if (ourEdge) {
    return removeEdge(graph, ourEdge);
  } else {
    throw new Error("Can't connect already connected vertices");
  }
}

export const removeVertex = (graph: PlanarGraph, vertexKey: string): PlanarGraph => {
  let newGraph = cloneDeep(graph);
  getOutgoingEdgeKeys(newGraph, vertexKey).forEach(eKey => {
    try {
      newGraph = removeEdge(newGraph, eKey);
    } catch (e) {
      newGraph = removeLeafVertex(newGraph, vertexKey)
    }
  });
  return newGraph;
}

export const removeVertexByCoord = (graph: PlanarGraph, c: Coord) => {
  return removeVertex(graph, getVertexKey(graph, c));
}

export const getBoundaryEdgeKeys = (graph: PlanarGraph, fKey: string): string[] => {
  let face = graph.faces[fKey];
  let boundaryEdgeKeys = [] as string[];
  if (face.incidentEdge) {
    let currentEdge = face.incidentEdge;
    while (!includes(boundaryEdgeKeys, currentEdge)) {
      boundaryEdgeKeys.push(currentEdge);
      currentEdge = graph.edges[currentEdge].next;
    }
  }
  return boundaryEdgeKeys;
}

export const getBoundaryVertexKeys = (graph: PlanarGraph, fKey: string): string[] => {
  return getBoundaryEdgeKeys(graph, fKey).map((eKey: string) => graph.edges[eKey].origin);
}

export const getSplitFaceKey = (graph: PlanarGraph, c1: Coord, c2: Coord): string | null => {
  let midpoint = { x: (c1.x + c2.x)/2, y: (c1.y + c2.y)/2 };
  let possFaceKey = getBoundingFaceKey(graph, midpoint);
  let commonFaces = intersection(getIncidentFaceKeys(graph, c1),
    getIncidentFaceKeys(graph, c2));
  if (includes(commonFaces, possFaceKey)) {
    const nonIntersect = (edgeKey: string) => {
      let firstVertex = graph.vertices[graph.edges[edgeKey].origin];
      let secondVertex = graph.vertices[graph.edges[graph.edges[edgeKey].next].origin];
      return !intersect(c1, c2, firstVertex, secondVertex);
    }
    return getBoundaryEdgeKeys(graph, possFaceKey).every(nonIntersect) ? possFaceKey : null;
  } else {
    return null;
  }
}

export const getOutgoingEdgeKeys = (graph: PlanarGraph, vKey: string): string[] => {
  let incidentEdgeKeys = [] as string[];
  if (graph.vertices[vKey].incidentEdge) {
    let currentEdgeKey = graph.vertices[vKey].incidentEdge;
    while (!includes(incidentEdgeKeys, currentEdgeKey)) {
      incidentEdgeKeys.push(currentEdgeKey);
      currentEdgeKey = graph.edges[graph.edges[currentEdgeKey].twin].next;
    }
  }
  return incidentEdgeKeys;
}

export const safeAddEdge = (graph: PlanarGraph, c1: Coord, c2: Coord): boolean => {
  try {
    addEdge(graph, c1, c2);
    return true;
  } catch (e) {
    return false;
  }
}

const begin = (c1: Coord, c2: Coord): PlanarGraph => {
  let v1Slug = getSlug();
  let v2Slug = getSlug();
  let e12Slug = getSlug();
  let e21Slug = getSlug();
  let v1: Vertex = { x: c1.x, y: c1.y, incidentEdge: e12Slug, colors: ALL_COLORS };
  let v2: Vertex = { x: c2.x, y: c2.y, incidentEdge: e21Slug, colors: ALL_COLORS };
  let e12: HalfEdge = { twin: e21Slug, next: e21Slug, prev: e21Slug, origin: v1Slug, incidentFace: 'infinite'};
  let e21: HalfEdge = { twin: e12Slug, next: e12Slug, prev: e12Slug, origin: v2Slug, incidentFace: 'infinite'};
  return {
    infiniteFace: 'infinite',
    vertices: { [v1Slug]: v1, [v2Slug]: v2 },
    edges: { [e12Slug]: e12, [e21Slug]: e21 },
    faces: { 'infinite': { infinite: true, incidentEdge: e12Slug } }
  } as PlanarGraph
}

const connect = (graph: PlanarGraph, vKey1: string, vKey2: string): PlanarGraph => {
  let newGraph = cloneDeep(graph);
  if (includes(getAdjacentVertices(newGraph, vKey1), vKey2)) {
    throw new Error("Can't connect already connected vertices");
  }
  let v1 = newGraph.vertices[vKey1];
  let v2 = newGraph.vertices[vKey2];
  let boundingFace = getSplitFaceKey(newGraph, v1, v2);
  if (boundingFace) {
    // First we fix all the edge pointers
    let e1Key = getNextClockwiseEdgeKey(newGraph, vKey1, angle(v1, v2));
    let e1 = newGraph.edges[e1Key];
    let e2Key = getNextClockwiseEdgeKey(newGraph, vKey2, angle(v2, v1));
    let e2 = newGraph.edges[e2Key];
    let v1v2Slug = getSlug();
    let v2v1Slug = getSlug();
    // The incidentFace pointers will be fixed later on...
    let v1v2 = { origin: vKey1, next: e2Key, prev: e1.prev, twin: v2v1Slug,
      incidentFace: boundingFace };
    let v2v1 = { origin: vKey2, next: e1Key, prev: e2.prev, twin: v1v2Slug,
      incidentFace: boundingFace };
    newGraph.edges[e1.prev].next = v1v2Slug;
    e1.prev = v2v1Slug;
    newGraph.edges[e2.prev].next = v2v1Slug;
    e2.prev = v1v2Slug;
    newGraph.edges[v1v2Slug] = v1v2;
    newGraph.edges[v2v1Slug] = v2v1;
    // Now we create a new face
    let newFaceEdge = newGraph.faces[boundingFace].infinite ? pickInfiniteEdge(newGraph, v1v2Slug) : v1v2Slug;
    newGraph.faces[boundingFace].incidentEdge = newGraph.edges[newFaceEdge].twin;
    let newFaceSlug = getSlug();
    let newFace = { infinite: false, incidentEdge: newFaceEdge };
    newGraph.edges[newGraph.edges[newFaceEdge].twin].incidentFace = boundingFace;
    newGraph.edges[newFaceEdge].incidentFace = newFaceSlug;
    let currentEdge = newGraph.edges[newFaceEdge].next;
    while (currentEdge !== newFaceEdge) {
      newGraph.edges[currentEdge].incidentFace = newFaceSlug;
      currentEdge = newGraph.edges[currentEdge].next;
    }
    newGraph.faces[newFaceSlug] = newFace;
    return newGraph;
  } else {
    throw new Error("Can't connect those vertices");
  }
}

const connectNewVertex = (graph: PlanarGraph, vKey: string, newVertex: Coord): PlanarGraph => {
  let boundingFaceKey: string | null = getSplitFaceKey(graph, graph.vertices[vKey], newVertex);
  if (boundingFaceKey) {
    let newGraph = cloneDeep(graph);
    let newVertexSlug = getSlug();
    let oldVertex = newGraph.vertices[vKey];
    let oldOutEdgeKey = getNextClockwiseEdgeKey(newGraph, vKey, angle(oldVertex, newVertex));
    let oldOutEdge = newGraph.edges[oldOutEdgeKey];
    let oldInEdgeKey = oldOutEdge.prev;
    let oldInEdge = newGraph.edges[oldInEdgeKey];
    let oldNewSlug = getSlug();
    let newOldSlug = getSlug();
    let oldNew: HalfEdge = { origin: vKey, prev: oldInEdgeKey, twin: newOldSlug,
      next: newOldSlug, incidentFace: boundingFaceKey };
    let newOld: HalfEdge = { origin: newVertexSlug, prev: oldNewSlug,
      next: oldOutEdgeKey, twin: oldNewSlug, incidentFace: boundingFaceKey };
    oldInEdge.next = oldNewSlug;
    oldOutEdge.prev = newOldSlug;
    newGraph.vertices[newVertexSlug] = { x: newVertex.x, y: newVertex.y,
      colors: ALL_COLORS, incidentEdge: newOldSlug }
    newGraph.edges[oldNewSlug] = oldNew;
    newGraph.edges[newOldSlug] = newOld;
    return newGraph;
  } else {
    throw new Error("Can't connect those vertices");
  }
}

const getAdjacentVertices = (graph: PlanarGraph, vertexKey: string): string[] => {
  return getOutgoingEdgeKeys(graph, vertexKey).map((eKey: string) =>
  graph.edges[graph.edges[eKey].next].origin);
}

export const getBoundaryVertices = (graph: PlanarGraph, fKey: string): Vertex[] => {
  return getBoundaryVertexKeys(graph, fKey).map((vKey: string) => graph.vertices[vKey]);
}

const getBoundingFaceKey = (graph: PlanarGraph, c: Coord): string => {
  let boundingFaceKey = graph.infiniteFace;
  Object.keys(graph.faces).forEach((fKey: string) => {
    if (graph.infiniteFace !== fKey &&
      inInterior(getBoundaryVertices(graph, fKey), c)) {
        boundingFaceKey = fKey;
      }
    });
    return boundingFaceKey;
}

const getIncidentFaceKeys = (graph: PlanarGraph, c: Coord): string[] => {
    let vKey = getVertexKey(graph, c)
    if (vKey) {
      let edgeKeys = getOutgoingEdgeKeys(graph, vKey);
      return edgeKeys.map(eKey => graph.edges[eKey].incidentFace);
    } else {
      return [getBoundingFaceKey(graph, c)];
    }
}

const getNextClockwiseEdgeKey = (graph: PlanarGraph, vKey: string, newAngle: number): string => {
    let keysWithAngles: [string, number][] =
    getOutgoingEdgeKeys(graph, vKey).map((eKey: string) => {
      let v1 = graph.vertices[graph.edges[eKey].origin];
      let v2 = graph.vertices[graph.edges[graph.edges[eKey].next].origin];
      return [eKey, angle(v1, v2)] as [string, number];
    });
    let smallAngleEdges = keysWithAngles.filter((ea: [string, number]) => ea[1] < newAngle);
    const sortByAngleDecreasing =
    (e1: [string, number], e2: [string, number]): number => (e2[1] - e1[1]);
    const getHighestAngleEdge =
    (pairList: [string, number][]): string =>
    (pairList.sort(sortByAngleDecreasing)[0][0]);
    return (smallAngleEdges.length > 0) ?
    getHighestAngleEdge(smallAngleEdges) :
    getHighestAngleEdge(keysWithAngles);
}

const getVertexKey = (graph: PlanarGraph, c: Coord): string | null => {
  let matchedVertexKey = null;
  forIn(graph.vertices, (value: Vertex, key: String) => {
    if (eq(value, c)) matchedVertexKey = key;
  });
  return matchedVertexKey;
}

const pickInfiniteEdge = (graph: PlanarGraph, eKey: string): string => {
  let e = graph.edges[eKey];
  let eTwin = graph.edges[e.twin];
  let vertices = [graph.vertices[eTwin.origin]];
  let currentEdge = graph.edges[eTwin.next];
  while (currentEdge !== eTwin) {
    vertices.push(graph.vertices[currentEdge.origin]);
    currentEdge = graph.edges[currentEdge.next];
  }
  return isClockwise(vertices) ? eKey : e.twin;
}

const removeEdgeFixOrigin = (graph: PlanarGraph, edgeKey: string): PlanarGraph => {
  let newGraph = cloneDeep(graph);
  let incomingEdgeKey = newGraph.edges[edgeKey].prev;
  let newOutgoingEdgeKey = newGraph.edges[newGraph.edges[edgeKey].twin].next;
  let faceKey = newGraph.edges[edgeKey].incidentFace;
  newGraph.edges[incomingEdgeKey].next = newOutgoingEdgeKey;
  newGraph.edges[newOutgoingEdgeKey].prev = incomingEdgeKey;
  newGraph.faces[faceKey].incidentEdge = incomingEdgeKey;
  newGraph.vertices[newGraph.edges[edgeKey].origin].incidentEdge = newOutgoingEdgeKey;
  return newGraph;
}

const removeLeafVertex = (graph: PlanarGraph, vertexKey: string): PlanarGraph => {
  let newGraph = cloneDeep(graph);
  if (getOutgoingEdgeKeys(newGraph, vertexKey).length === 1) {
    let outgoingEdgeKey = newGraph.vertices[vertexKey].incidentEdge
    let twinEdgeKey = newGraph.edges[outgoingEdgeKey].twin
    newGraph = removeEdgeFixOrigin(graph, twinEdgeKey);
    delete newGraph.vertices[vertexKey];
    delete newGraph.edges[outgoingEdgeKey];
    delete newGraph.edges[twinEdgeKey];
    return newGraph;
  } else {
    throw new Error("Not a leaf vertex!")
  }
}

export const getColors = (g: PlanarGraph, vKey: string): Color[] => {
  return g.vertices[vKey].colors;
}

export const setColors = (g: PlanarGraph, vKey: string, newColors: Color[]): PlanarGraph => {
  let newGraph = cloneDeep(g);
  newGraph.vertices[vKey].colors = newColors;
  return newGraph;
}
