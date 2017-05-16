import { GraphDrawingWrapper } from './canvas_wrapper';
import { Color } from './planar_graph';

export enum AnimationType {
  DrawEdge,
  UpdateColors,
  RestrictGraph
}

interface Animation {
  type: AnimationType,
  data: any
}

let animationSteps: Animation[] = [];

window.animationSteps = animationSteps;

// A controlled effectful function to use in the thomassen algorithms.
export const addStep = (type: AnimationType, data: any) => {
  animationSteps.push({type, data})
}

export const animate = (canvas: GraphDrawingWrapper): void => {
  animationSteps.forEach(a => {
    switch (a.type) {
      case AnimationType.DrawEdge:
        canvas.drawEdge(a.data[0], a.data[1], "blue");
        break;
      case AnimationType.UpdateColors:
        canvas.drawCircle(a.data.vertex, "none", a.data.colors)
        break;
      case AnimationType.RestrictGraph:
        break;
    }
  });
};
