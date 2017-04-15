import { Vertex, HalfEdge, Face } from './vertex';
import { PlanarGraph } from './planar_graph';
import { GraphDrawingWrapper } from './canvas_wrapper';

const PAUSE = 500;

export const animate = (canvas: GraphDrawingWrapper): void => {
  triangulate(canvas);
  color(canvas);
}

const triangulate = (canvas: GraphDrawingWrapper): void => {
  let graph = canvas.graph;
  let isTriangulated = false;
  while (!isTriangulated) {
    isTriangulated = true;
    graph.faces.forEach(f => {
      isTriangulated = isTriangulated && triangulateFace(canvas, f)
    });
  }
}

const triangulateFace = (canvas: GraphDrawingWrapper, face: Face): boolean => {
  let graph = canvas.graph;
  let edges = graph.getBoundaryEdges(face);
  if (edges.length > 3 && !face.infinite) {
    let potentialEdges: Vertex[][] = edges.map(e => [e.origin, e.next.next.origin]);
    for (let i = 0; i < potentialEdges.length; i++) {
      let v1 = potentialEdges[i][0];
      let v2 = potentialEdges[i][1];
      if (graph.getEdgeFace(v1, v2) === face) {
        canvas.drawEdge(v1, v2, "blue");
        return false;
      }
    }
  }
  return true;
}

const color = (canvas: GraphDrawingWrapper): void => {
  let graph = canvas.graph;
  console.log("coloring");
}
