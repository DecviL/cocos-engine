// Copyright (c) 2017-2018 Xiamen Yaji Software Co., Ltd.

import config from '../config';
import Pass from '../core/pass';
import Technique from '../core/technique';
import { getInspectorProps, cloneObjArray, getInstanceCtor } from '../types';
import enums from '../enums';

class Effect {
    /**
     * @param {Array} techniques
     */
    constructor(name, techniques, properties = {}, defines = {}, dependencies = []) {
        this._name = name;
        this._techniques = techniques;
        this._properties = properties;
        this._defines = defines;
        this._dependencies = dependencies;
        
        if (CC_JSB && CC_NATIVERENDERER) {
            var techniqueObjs = [];
            var techniqueObj;
            // get native technique info
            for (var i = 0, len = techniques.length; i < len; ++i) {
                techniqueObj = techniques[i]._nativeObj; 
                techniqueObjs.push(techniqueObj);
            }

            var definesArr = [];
            for (var key in defines) {
                definesArr.push({name:key, value:defines[key]});
            }

            this._nativeObj = new renderer.EffectNative();
            this._nativeObj.init(techniqueObjs, properties, definesArr);
            this._nativePtr = this._nativeObj.self();
        }

        // TODO: check if params is valid for current technique???
    }

    clear() {
        this._techniques.length = 0;
        this._properties = {};
        this._defines = {};

        if (CC_JSB && CC_NATIVERENDERER) {
            this._nativeObj.clear();
        }
    }

    getDefaultTechnique() {
        return this._techniques[0];
    }

    getTechnique(stage) {
        let stageID = config.stageID(stage);
        if (stageID === -1) {
            return null;
        }

        for (let i = 0; i < this._techniques.length; ++i) {
            let tech = this._techniques[i];
            if (tech.stageIDs & stageID) {
                return tech;
            }
        }

        return null;
    }

    getProperty(name) {
        if (!this._properties[name]) {
            cc.warn(`${this._name} : Failed to get property ${name}, property not found.`);
            return null;
        }
        return this._properties[name].value;
    }

    setProperty(name, value) {
        let prop = this._properties[name];
        if (!prop) {
            cc.warn(`${this._name} : Failed to set property ${name}, property not found.`);
            return;
        }

        if (Array.isArray(value)) {
            let array = prop.value;
            if (array.length !== value.length) {
                cc.warn(`${this._name} : Failed to set property ${name}, property length not correct.`);
                return;
            }
            for (let i = 0; i < value.length; i++) {
                array[i] = value[i];
            }
        }
        else {
            if (value instanceof cc.Texture2D) {
                prop.value = value.getImpl();
            }
            else if (value.array) {
                value.array(prop.value)
            }
            else {
                prop.value = value;
            }
        }
        
        if (CC_JSB && CC_NATIVERENDERER) {
            this._nativeObj.setProperty(name, prop.value);
        }
    }

    updateHash(hash) {
        if (CC_JSB && CC_NATIVERENDERER) {
            this._nativeObj.updateHash(hash);
        }
    }

    getDefine(name) {
        let def = this._defines[name];
        if (def === undefined) {
            cc.warn(`${this._name} : Failed to get define ${name}, define not found.`);
        }

        return def;
    }

    define(name, value) {
        let def = this._defines[name];
        if (def === undefined) {
            cc.warn(`${this._name} : Failed to set define ${name}, define not found.`);
            return;
        }

        this._defines[name] = value;

        if (CC_JSB && CC_NATIVERENDERER) {
            this._nativeObj.define(name, value);
        }
    }

    extractProperties(out = {}) {
        Object.assign(out, this._properties);
        return out;
    }

    extractDefines(out = {}) {
        Object.assign(out, this._defines);
        return out;
    }

    extractDependencies(out = {}) {
        for (let i = 0; i < this._dependencies.length; ++i) {
            let dep = this._dependencies[i];
            out[dep.define] = dep.extension;
        }

        return out;
    }
}


let getInvolvedPrograms = function(json) {
    let programs = [], lib = cc.renderer._forward._programLib;
    json.techniques.forEach(tech => {
        tech.passes.forEach(pass => {
            programs.push(lib.getTemplate(pass.program));
        });
    });
    return programs;
};
let parseProperties = (function() {
    return function(json, programs) {
        let props = {};

        let properties = {};
        json.techniques.forEach(tech => {
            tech.passes.forEach(pass => {
                Object.assign(properties, pass.properties);
            })
        });

        for (let prop in properties) {
            let propInfo = properties[prop], uniformInfo;
            for (let i = 0; i < programs.length; i++) {
                uniformInfo = programs[i].uniforms.find(u => u.name === prop);
                if (uniformInfo) break;
            }
            // the property is not defined in all the shaders used in techs
            if (!uniformInfo) {
                cc.warn(`${json.name} : illegal property: ${prop}`);
                continue;
            }
            // TODO: different param with same name for different passes
            props[prop] = Object.assign({}, propInfo);
            props[prop].value = propInfo.type === enums.PARAM_TEXTURE_2D ? null : new Float32Array(propInfo.value);
        }
        return props;
    };
})();

Effect.parseEffect = function(effect) {
    // techniques
    let techNum = effect.techniques.length;
    let techniques = new Array(techNum);
    for (let j = 0; j < techNum; ++j) {
        let tech = effect.techniques[j];
        if (!tech.stages) {
            tech.stages = ['opaque']
        }
        let passNum = tech.passes.length;
        let passes = new Array(passNum);
        for (let k = 0; k < passNum; ++k) {
            let pass = tech.passes[k];
            passes[k] = new Pass(pass.program);

            // rasterizer state
            if (pass.rasterizerState) {
                passes[k].setCullMode(pass.rasterizerState.cullMode);
            }

            // blend state
            let blendState = pass.blendState && pass.blendState.targets[0];
            if (blendState) {
                passes[k].setBlend(blendState.blend, blendState.blendEq, blendState.blendSrc,
                    blendState.blendDst, blendState.blendAlphaEq, blendState.blendSrcAlpha, blendState.blendDstAlpha, blendState.blendColor);
            }

            // depth stencil state
            let depthStencilState = pass.depthStencilState;
            if (depthStencilState) {
                passes[k].setDepth(depthStencilState.depthTest, depthStencilState.depthWrite, depthStencilState.depthFunc);
            passes[k].setStencilFront(depthStencilState.stencilTest, depthStencilState.stencilFuncFront, depthStencilState.stencilRefFront, depthStencilState.stencilMaskFront,
                depthStencilState.stencilFailOpFront, depthStencilState.stencilZFailOpFront, depthStencilState.stencilZPassOpFront, depthStencilState.stencilWriteMaskFront);
            passes[k].setStencilBack(depthStencilState.stencilTest, depthStencilState.stencilFuncBack, depthStencilState.stencilRefBack, depthStencilState.stencilMaskBack,
                depthStencilState.stencilFailOpBack, depthStencilState.stencilZFailOpBack, depthStencilState.stencilZPassOpBack, depthStencilState.stencilWriteMaskBack);
            }
        }
        techniques[j] = new Technique(tech.stages, passes, tech.layer);
    }
    let programs = getInvolvedPrograms(effect);

    let props = parseProperties(effect, programs), uniforms = {}, defines = {};
    programs.forEach(p => {
        // uniforms
        p.uniforms.forEach(u => {
            let name = u.name, uniform = uniforms[name] = Object.assign({}, u);
            uniform.value = getInstanceCtor(u.type)(u.value);
            if (props[name]) { // effect info override
                uniform.type = props[name].type;
                uniform.value = props[name].value;
            }
        });

        p.defines.forEach(d => {
            defines[d.name] = getInstanceCtor(d.type)();
        })
    });
    // extensions
    let extensions = programs.reduce((acc, cur) => acc = acc.concat(cur.extensions), []);
    extensions = cloneObjArray(extensions);

    return new Effect(effect.name, techniques, uniforms, defines, extensions);
};

if (CC_EDITOR) {
    Effect.parseForInspector = function(json) {
        let programs = getInvolvedPrograms(json);
        let props = parseProperties(json, programs), defines = {};

        for (let pn in programs) {
            programs[pn].uniforms.forEach(u => {
                let prop = props[u.name];
                if (!prop) return;
                prop.defines = u.defines;
            });
            programs[pn].defines.forEach(define => {
                defines[define.name] = getInspectorProps(define);
            });
        }
        
        for (let name in props) {
            props[name] = getInspectorProps(props[name]);
        }

        return { props, defines };
    };
}

export default Effect;
cc.Effect = Effect;
