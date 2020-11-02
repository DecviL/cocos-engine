/**
 * @packageDocumentation
 * @module gfx
 */

import {
    Format,
    LoadOp,
    Obj,
    ObjectType,
    PipelineBindPoint,
    StoreOp,
    TextureLayout,
} from './define';
import { Device } from './device';
import { murmurhash2_32_gc } from '../utils/murmurhash2_gc';

/**
 * @en Color attachment.
 * @zh GFX 颜色附件。
 */
export class ColorAttachment {
    declare private token: never; // to make sure all usages must be an instance of this exact class, not assembled from plain object

    constructor (
        public format: Format = Format.UNKNOWN,
        public sampleCount: number = 1,
        public loadOp: LoadOp = LoadOp.CLEAR,
        public storeOp: StoreOp = StoreOp.STORE,
        public beginLayout: TextureLayout = TextureLayout.UNDEFINED,
        public endLayout: TextureLayout = TextureLayout.PRESENT_SRC,
    ) {}
}

/**
 * @en Depth stencil attachment.
 * @zh GFX 深度模板附件。
 */
export class DepthStencilAttachment {
    declare private token: never; // to make sure all usages must be an instance of this exact class, not assembled from plain object

    constructor (
        public format: Format = Format.UNKNOWN,
        public sampleCount: number = 1,
        public depthLoadOp: LoadOp = LoadOp.CLEAR,
        public depthStoreOp: StoreOp = StoreOp.STORE,
        public stencilLoadOp: LoadOp = LoadOp.CLEAR,
        public stencilStoreOp: StoreOp = StoreOp.STORE,
        public beginLayout: TextureLayout = TextureLayout.UNDEFINED,
        public endLayout: TextureLayout = TextureLayout.DEPTH_STENCIL_ATTACHMENT_OPTIMAL,
    ) {}
}

export class SubPassInfo {
    declare private token: never; // to make sure all usages must be an instance of this exact class, not assembled from plain object

    constructor (
        public bindPoint: PipelineBindPoint = PipelineBindPoint.GRAPHICS,
        public inputs: number[] = [],
        public colors: number[] = [],
        public resolves: number[] = [],
        public depthStencil: number = -1,
        public preserves: number[] = [],
    ) {}
}

export class RenderPassInfo {
    declare private token: never; // to make sure all usages must be an instance of this exact class, not assembled from plain object

    constructor (
        public colorAttachments: ColorAttachment[] = [],
        public depthStencilAttachment: DepthStencilAttachment | null = null,
        public subPasses: SubPassInfo[] = [],
    ) {}
}

/**
 * @en GFX render pass.
 * @zh GFX 渲染过程。
 */
export abstract class RenderPass extends Obj {

    protected _device: Device;

    protected _colorInfos: ColorAttachment[] = [];

    protected _depthStencilInfo: DepthStencilAttachment | null = null;

    protected _subPasses : SubPassInfo[] = [];

    protected _hash: number = 0;

    get colorAttachments () { return this._colorInfos; }
    get depthStencilAttachment () { return this._depthStencilInfo; }
    get subPasses () { return this._subPasses; }
    get hash () { return this._hash; }

    constructor (device: Device) {
        super(ObjectType.RENDER_PASS);
        this._device = device;
    }

    public abstract initialize (info: RenderPassInfo): boolean;

    public abstract destroy (): void;

    // Based on render pass compatibility
    protected computeHash (): number {
        let res = '';
        if (this._subPasses.length) {
            for (let i = 0; i < this._subPasses.length; ++i) {
                const subpass = this._subPasses[i];
                if (subpass.inputs.length) {
                    res += 'ia';
                    for (let j = 0; j < subpass.inputs.length; ++j) {
                        const ia = this._colorInfos[subpass.inputs[j]];
                        res += `,${ia.format},${ia.sampleCount}`;
                    }
                }
                if (subpass.colors.length) {
                    res += 'ca';
                    for (let j = 0; j < subpass.inputs.length; ++j) {
                        const ca = this._colorInfos[subpass.inputs[j]];
                        res += `,${ca.format},${ca.sampleCount}`;
                    }
                }
                if (subpass.depthStencil >= 0) {
                    const ds = this._colorInfos[subpass.depthStencil];
                    res += `ds,${ds.format},${ds.sampleCount}`;
                }
            }
        } else {
            res += 'ca';
            for (let i = 0; i < this._colorInfos.length; ++i) {
                const ca = this._colorInfos[i];
                res += `,${ca.format},${ca.sampleCount}`;
            }
            const ds = this._depthStencilInfo;
            if (ds) {
                res += `ds,${ds.format},${ds.sampleCount}`;
            }
        }

        return murmurhash2_32_gc(res, 666);
    }
}
