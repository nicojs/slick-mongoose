import { Coord, eq, angle, getConsecutiveCoordPairs, convexHull, pointSegmentDistance } from './geom';
import { Vertex, HalfEdge, Face, PlanarGraph, Color, ALL_COLORS,
  addEdge, safeAddEdge, removeEdge, removeVertex, splitChordedGraph, getAdjacentVertices,
  getBoundaryEdgeKeys, getBoundaryVertexKeys, getOutgoingEdgeKeys, findChordKey,
  getSplitFaceKey, getColors, setColors, findVp, getEndpoints } from './planar_graph';
import { AnimationType, addStep, resetAnimation } from './animation';
import { values, forIn, includes, difference, cloneDeep } from 'lodash';

const minDist = (cList: Coord[], ep1: Coord, ep2: Coord): number => {
  let sansEndpoints = cList.filter(v => !(eq(v, ep1) || eq(v, ep2)));
  return Math.min(...sansEndpoints.map(v => pointSegmentDistance(v, ep1, ep2)));
}

const animAddEdge = (g: PlanarGraph, pair: Vertex[]) => {
  addStep(AnimationType.AddEdge, 0, pair);
  return addEdge(g, pair[0], pair[1]);
}

const hullify = (g: PlanarGraph): PlanarGraph => {
  addStep(AnimationType.Describe, 1000,
    "Add edges so that the graph is triangulated and 2-connected. A coloring of the new graph will work as a coloring of the original graph.")
  let hullVertices = convexHull(values(g.vertices));
  hullVertices.map(getConsecutiveCoordPairs).forEach((pair: Vertex[]) => {
    if (safeAddEdge(g, pair[0], pair[1])) {
      g = animAddEdge(g, pair);
    }
  });
  return g;
}

const getBestSplittingEdge = (g: PlanarGraph, edgeKeys: string[], faceKey: string): Vertex[] => {
  let mostDist = -1;
  let bestPair = [] as Vertex[];
  let potentialEdges: string[][] = edgeKeys.map(eKey =>
    [g.edges[eKey].origin, g.edges[g.edges[g.edges[eKey].next].next].origin]);
  let faceVertices = edgeKeys.map(eKey => g.vertices[g.edges[eKey].origin])
  for (let i = 0; i < potentialEdges.length; i++) {
    let v1 = g.vertices[potentialEdges[i][0]];
    let v2 = g.vertices[potentialEdges[i][1]];
    if (getSplitFaceKey(g, v1, v2) === faceKey) {
      let dist = minDist(faceVertices, v1, v2);
      if (dist > mostDist) {
        mostDist = dist;
        bestPair = [v1, v2]
      }
    }
  }
  return bestPair;
}

const splitFace = (g: PlanarGraph, faceKey: string): PlanarGraph => {
  let edges = getBoundaryEdgeKeys(g, faceKey);
  if (edges.length > 3 && g.infiniteFace !== faceKey) {
    let e = getBestSplittingEdge(g, edges, faceKey);
    g = animAddEdge(g, e);
  }
  return g;
}

const isTriangulated = (g: PlanarGraph): boolean => {
  return Object.keys(g.faces).every(fKey =>
    (g.infiniteFace === fKey || getBoundaryEdgeKeys(g, fKey).length === 3));
}

const triangulate = (g: PlanarGraph): PlanarGraph => {
  while (!isTriangulated(g)) {
    forIn(g.faces, (f: Face, fKey: string) => {
      if (getBoundaryEdgeKeys(g, fKey).length > 3) {
        g = splitFace(g, fKey)
      }
    });
  }
  addStep(AnimationType.Pause, 3000, {});
  return g;
}

const preColor = (g: PlanarGraph): PlanarGraph => {
  const boundingVertices = getBoundaryVertexKeys(g, g.infiniteFace);
  g.mark1 = boundingVertices[0];
  g.mark2 = boundingVertices[1];
  addStep(AnimationType.Describe, 2000, "Begin with vertices having five possible colors");
  Object.keys(g.vertices).forEach(vKey => {
    g = updateColors(g, vKey, ALL_COLORS, 0);
  })
  addStep(AnimationType.Pause, 1000, {});
  addStep(AnimationType.Describe, 2000, "Restrict outer vertices to three possible colors");
  boundingVertices.forEach(vKey =>
    g = updateColors(g, vKey, ALL_COLORS.slice(0, 3), 0))
    addStep(AnimationType.Pause, 1000, {});
  addStep(AnimationType.Describe, 2000, "Color two adjacent outer vertices red and blue");
  g = updateColors(g, g.mark1, [Color.Red], 0);
  g = updateColors(g, g.mark2, [Color.Blue], 0);
  addStep(AnimationType.Pause, 1000, {});
  return g;
}

const updateColors = (g: PlanarGraph, vKey: string, colors: Color[], time: number) => {
  addStep(AnimationType.UpdateColors, time, { vertex: g.vertices[vKey], colors });
  return setColors(g, vKey, colors);
}

const colorTriangle = (g: PlanarGraph): PlanarGraph => {
  let badColors = [getColors(g, g.mark1)[0], getColors(g, g.mark2)[0]]
  let thirdVertexKey = difference(Object.keys(g.vertices), [g.mark1, g.mark2])[0];
  let okayColor = difference(getColors(g, thirdVertexKey), badColors)[0];
  addStep(AnimationType.Describe, 1000, "Color the triangle");
  return updateColors(g, thirdVertexKey, [okayColor], 1000);
}

const transferColors = (graph: PlanarGraph, subGraph: PlanarGraph): PlanarGraph => {
  let newGraph = cloneDeep(graph);
  Object.keys(subGraph.vertices).forEach(vKey => {
    newGraph = setColors(newGraph, vKey, getColors(subGraph, vKey))
  });
  return newGraph;
};

const colorChordlessGraph = (g: PlanarGraph): PlanarGraph => {
  let boundaryVertices = getBoundaryVertexKeys(g, g.infiniteFace);
  let vp = findVp(g);
  let twoColors = difference(getColors(g, vp), getColors(g, g.mark1)).slice(0, 2);
  addStep(AnimationType.Describe, 3000, "Restrict the vertex next to one of the colored vertices to two possible colors, not including the color of the colored vertex");
  let updatedGraph = updateColors(g, vp, twoColors, 1000);
  let subGraph = removeVertex(updatedGraph, vp);
  let vp1: string;
  addStep(AnimationType.Describe, 3000, "Ensure that the neighbors of the vertex in the interior of the graph can't be colored with those two colors");
  getAdjacentVertices(g, vp).forEach(vKey => {
    if (!includes(boundaryVertices, vKey)) {
      subGraph = updateColors(subGraph, vKey,
        difference(getColors(subGraph, vKey), twoColors).slice(0, 3), 300);
    } else if (vKey !== g.mark1) {
        vp1 = vKey;
    }
  });
  addStep(AnimationType.Describe, 3000, "Recursively color the graph with the vertex removed");
  subGraph = color(subGraph);
  let newGraph = transferColors(updatedGraph, subGraph);
  addStep(AnimationType.RestrictGraph, 0, { graph: newGraph });
  addStep(AnimationType.Describe, 2000, "Color the vertex we removed")
  newGraph = updateColors(newGraph, vp,
    difference(twoColors, getColors(newGraph, vp1)).slice(0, 1), 1000);
  return newGraph;
}

const colorChordedGraph = (g: PlanarGraph, chordKey: string): PlanarGraph => {
  let [firstSubgraph, secondSubgraph] = splitChordedGraph(g, chordKey);
  firstSubgraph = color(firstSubgraph);
  secondSubgraph = updateColors(secondSubgraph, secondSubgraph.mark1,
    getColors(firstSubgraph, secondSubgraph.mark1), 1000);
  secondSubgraph = updateColors(secondSubgraph, secondSubgraph.mark2,
    getColors(firstSubgraph, secondSubgraph.mark2), 1000);
  secondSubgraph = color(secondSubgraph);
  let newGraph = transferColors(g, firstSubgraph);
  newGraph = transferColors(newGraph, secondSubgraph);
  return newGraph;
}

 const color = (g: PlanarGraph): PlanarGraph => {
  addStep(AnimationType.RestrictGraph, 0, { graph: g });
  if (values(g.vertices).length == 3) {
    return colorTriangle(g);
  } else {
    let chord = findChordKey(g);
    if (chord) {
      addStep(AnimationType.Describe, 2000,
        "There is a chord; split the graph and recursively color the subgraphs");-
      addStep(AnimationType.HighlightEdge, 1000, getEndpoints(g, chord));
      return colorChordedGraph(g, chord);
    } else {
      addStep(AnimationType.Describe, 2000,
        "There is no chord...")
      return colorChordlessGraph(g);
    }
  }
}

export const fiveColor = (graph: PlanarGraph): PlanarGraph => {
  resetAnimation();
  let coloredGraph = color(preColor(triangulate(hullify(graph))));
  addStep(AnimationType.RestrictGraph, 0, { graph: coloredGraph });
  addStep(AnimationType.Describe, 0, "We're done!")
  return coloredGraph;
}
