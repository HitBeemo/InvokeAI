import { logger } from 'app/logging/logger';
import { RootState } from 'app/store/store';
import { NonNullableGraph } from 'features/nodes/types/types';
import { initialGenerationState } from 'features/parameters/store/generationSlice';
import {
  DenoiseLatentsInvocation,
  ONNXTextToLatentsInvocation,
} from 'services/api/types';
import { addControlNetToLinearGraph } from './addControlNetToLinearGraph';
import { addDynamicPromptsToGraph } from './addDynamicPromptsToGraph';
import { addNSFWCheckerToGraph } from './addNSFWCheckerToGraph';
import { addSDXLLoRAsToGraph } from './addSDXLLoRAstoGraph';
import { addSDXLRefinerToGraph } from './addSDXLRefinerToGraph';
import { addVAEToGraph } from './addVAEToGraph';
import { addWatermarkerToGraph } from './addWatermarkerToGraph';
import {
  CANVAS_OUTPUT,
  METADATA_ACCUMULATOR,
  NEGATIVE_CONDITIONING,
  NOISE,
  ONNX_MODEL_LOADER,
  POSITIVE_CONDITIONING,
  SDXL_CANVAS_TEXT_TO_IMAGE_GRAPH,
  SDXL_DENOISE_LATENTS,
  SDXL_MODEL_LOADER,
} from './constants';
import { craftSDXLStylePrompt } from './helpers/craftSDXLStylePrompt';

/**
 * Builds the Canvas tab's Text to Image graph.
 */
export const buildCanvasSDXLTextToImageGraph = (
  state: RootState
): NonNullableGraph => {
  const log = logger('nodes');
  const {
    positivePrompt,
    negativePrompt,
    model,
    cfgScale: cfg_scale,
    scheduler,
    steps,
    vaePrecision,
    clipSkip,
    shouldUseCpuNoise,
    shouldUseNoiseSettings,
  } = state.generation;

  // The bounding box determines width and height, not the width and height params
  const { width, height } = state.canvas.boundingBoxDimensions;

  const { shouldAutoSave } = state.canvas;

  const { shouldUseSDXLRefiner, refinerStart, shouldConcatSDXLStylePrompt } =
    state.sdxl;

  if (!model) {
    log.error('No model found in state');
    throw new Error('No model found in state');
  }

  const use_cpu = shouldUseNoiseSettings
    ? shouldUseCpuNoise
    : initialGenerationState.shouldUseCpuNoise;

  const isUsingOnnxModel = model.model_type === 'onnx';

  const modelLoaderNodeId = isUsingOnnxModel
    ? ONNX_MODEL_LOADER
    : SDXL_MODEL_LOADER;

  const modelLoaderNodeType = isUsingOnnxModel
    ? 'onnx_model_loader'
    : 'sdxl_model_loader';

  const t2lNode: DenoiseLatentsInvocation | ONNXTextToLatentsInvocation =
    isUsingOnnxModel
      ? {
          type: 't2l_onnx',
          id: SDXL_DENOISE_LATENTS,
          is_intermediate: true,
          cfg_scale,
          scheduler,
          steps,
        }
      : {
          type: 'denoise_latents',
          id: SDXL_DENOISE_LATENTS,
          is_intermediate: true,
          cfg_scale,
          scheduler,
          steps,
          denoising_start: 0,
          denoising_end: shouldUseSDXLRefiner ? refinerStart : 1,
        };

  // Construct Style Prompt
  const { craftedPositiveStylePrompt, craftedNegativeStylePrompt } =
    craftSDXLStylePrompt(state, shouldConcatSDXLStylePrompt);

  /**
   * The easiest way to build linear graphs is to do it in the node editor, then copy and paste the
   * full graph here as a template. Then use the parameters from app state and set friendlier node
   * ids.
   *
   * The only thing we need extra logic for is handling randomized seed, control net, and for img2img,
   * the `fit` param. These are added to the graph at the end.
   */

  // copy-pasted graph from node editor, filled in with state values & friendly node ids
  // TODO: Actually create the graph correctly for ONNX
  const graph: NonNullableGraph = {
    id: SDXL_CANVAS_TEXT_TO_IMAGE_GRAPH,
    nodes: {
      [modelLoaderNodeId]: {
        type: modelLoaderNodeType,
        id: modelLoaderNodeId,
        is_intermediate: true,
        model,
      },
      [POSITIVE_CONDITIONING]: {
        type: isUsingOnnxModel ? 'prompt_onnx' : 'sdxl_compel_prompt',
        id: POSITIVE_CONDITIONING,
        is_intermediate: true,
        prompt: positivePrompt,
        style: craftedPositiveStylePrompt,
      },
      [NEGATIVE_CONDITIONING]: {
        type: isUsingOnnxModel ? 'prompt_onnx' : 'sdxl_compel_prompt',
        id: NEGATIVE_CONDITIONING,
        is_intermediate: true,
        prompt: negativePrompt,
        style: craftedNegativeStylePrompt,
      },
      [NOISE]: {
        type: 'noise',
        id: NOISE,
        is_intermediate: true,
        width,
        height,
        use_cpu,
      },
      [t2lNode.id]: t2lNode,
      [CANVAS_OUTPUT]: {
        type: isUsingOnnxModel ? 'l2i_onnx' : 'l2i',
        id: CANVAS_OUTPUT,
        is_intermediate: !shouldAutoSave,
        fp32: vaePrecision === 'fp32' ? true : false,
      },
    },
    edges: [
      // Connect Model Loader to UNet and CLIP
      {
        source: {
          node_id: modelLoaderNodeId,
          field: 'unet',
        },
        destination: {
          node_id: SDXL_DENOISE_LATENTS,
          field: 'unet',
        },
      },
      {
        source: {
          node_id: modelLoaderNodeId,
          field: 'clip',
        },
        destination: {
          node_id: POSITIVE_CONDITIONING,
          field: 'clip',
        },
      },
      {
        source: {
          node_id: modelLoaderNodeId,
          field: 'clip2',
        },
        destination: {
          node_id: POSITIVE_CONDITIONING,
          field: 'clip2',
        },
      },
      {
        source: {
          node_id: modelLoaderNodeId,
          field: 'clip',
        },
        destination: {
          node_id: NEGATIVE_CONDITIONING,
          field: 'clip',
        },
      },
      {
        source: {
          node_id: modelLoaderNodeId,
          field: 'clip2',
        },
        destination: {
          node_id: NEGATIVE_CONDITIONING,
          field: 'clip2',
        },
      },
      // Connect everything to Denoise Latents
      {
        source: {
          node_id: POSITIVE_CONDITIONING,
          field: 'conditioning',
        },
        destination: {
          node_id: SDXL_DENOISE_LATENTS,
          field: 'positive_conditioning',
        },
      },
      {
        source: {
          node_id: NEGATIVE_CONDITIONING,
          field: 'conditioning',
        },
        destination: {
          node_id: SDXL_DENOISE_LATENTS,
          field: 'negative_conditioning',
        },
      },
      {
        source: {
          node_id: NOISE,
          field: 'noise',
        },
        destination: {
          node_id: SDXL_DENOISE_LATENTS,
          field: 'noise',
        },
      },
      // Decode Denoised Latents To Image
      {
        source: {
          node_id: SDXL_DENOISE_LATENTS,
          field: 'latents',
        },
        destination: {
          node_id: CANVAS_OUTPUT,
          field: 'latents',
        },
      },
    ],
  };

  // add metadata accumulator, which is only mostly populated - some fields are added later
  graph.nodes[METADATA_ACCUMULATOR] = {
    id: METADATA_ACCUMULATOR,
    type: 'metadata_accumulator',
    generation_mode: 'txt2img',
    cfg_scale,
    height,
    width,
    positive_prompt: '', // set in addDynamicPromptsToGraph
    negative_prompt: negativePrompt,
    model,
    seed: 0, // set in addDynamicPromptsToGraph
    steps,
    rand_device: use_cpu ? 'cpu' : 'cuda',
    scheduler,
    vae: undefined, // option; set in addVAEToGraph
    controlnets: [], // populated in addControlNetToLinearGraph
    loras: [], // populated in addLoRAsToGraph
    clip_skip: clipSkip,
  };

  graph.edges.push({
    source: {
      node_id: METADATA_ACCUMULATOR,
      field: 'metadata',
    },
    destination: {
      node_id: CANVAS_OUTPUT,
      field: 'metadata',
    },
  });

  // Add Refiner if enabled
  if (shouldUseSDXLRefiner) {
    addSDXLRefinerToGraph(state, graph, SDXL_DENOISE_LATENTS);
  }

  // add LoRA support
  addSDXLLoRAsToGraph(state, graph, SDXL_DENOISE_LATENTS, modelLoaderNodeId);

  // optionally add custom VAE
  addVAEToGraph(state, graph, modelLoaderNodeId);

  // add dynamic prompts - also sets up core iteration and seed
  addDynamicPromptsToGraph(state, graph);

  // add controlnet, mutating `graph`
  addControlNetToLinearGraph(state, graph, SDXL_DENOISE_LATENTS);

  // NSFW & watermark - must be last thing added to graph
  if (state.system.shouldUseNSFWChecker) {
    // must add before watermarker!
    addNSFWCheckerToGraph(state, graph, CANVAS_OUTPUT);
  }

  if (state.system.shouldUseWatermarker) {
    // must add after nsfw checker!
    addWatermarkerToGraph(state, graph, CANVAS_OUTPUT);
  }

  return graph;
};
