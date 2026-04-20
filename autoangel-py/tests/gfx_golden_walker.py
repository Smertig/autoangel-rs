"""Walker that recursively converts any `autoangel` pyclass instance into a
plain dict in the same shape `tsify` emits on the WASM side. Used by the gold
tests and the golden-update script.

The walker calls every public getter declared on the pyclass type — a
missing / renamed / broken getter surfaces as AttributeError or as a dict diff
against the committed `.gfx.json` golden.
"""
from typing import Any

import autoangel

# Python class name -> serde rename string, for complex-enum variants.
# Mirrors `#[serde(rename = ...)]` attributes in autoangel-core/src/model/gfx.rs.
_ELEMENT_BODY_TAG = {
    "Unknown": "unknown",
    "Decal": "decal",
    "Trail": "trail",
    "Light": "light",
    "Ring": "ring",
    "Model": "model",
    "Container": "container",
    "Particle": "particle",
    "GridDecal3D": "grid_decal_3d",
    "Lightning": "lightning",
    "LtnBolt": "ltn_bolt",
    "LightningEx": "lightning_ex",
    "Sound": "sound",
}

_EMITTER_SHAPE_TAG = {
    "Point": "point",
    "Box": "box",
    "Ellipsoid": "ellipsoid",
    "Cylinder": "cylinder",
    "MultiPlane": "multi_plane",
    "Curve": "curve",
}

_KP_CTRL_BODY_TAG = {
    "Move": "move",
    "Rot": "rot",
    "RotAxis": "rot_axis",
    "Revol": "revol",
    "CentriMove": "centri_move",
    "Color": "color",
    "Scale": "scale",
    "ClNoise": "cl_noise",
    "ClTrans": "cl_trans",
    "ScaNoise": "sca_noise",
    "CurveMove": "curve_move",
    "ScaleTrans": "scale_trans",
    "NoiseBase": "noise_base",
    "Unknown": "unknown",
}


def _discriminator(cls: type) -> dict[str, str]:
    parent = cls.__bases__[0] if cls.__bases__ else object
    if parent is autoangel.ElementBody:
        return {"kind": _ELEMENT_BODY_TAG[cls.__name__]}
    if parent is autoangel.EmitterShape:
        return {"shape": _EMITTER_SHAPE_TAG[cls.__name__]}
    if parent is autoangel.KpCtrlBody:
        return {"kind": _KP_CTRL_BODY_TAG[cls.__name__]}
    return {}


def to_dict(obj: Any) -> Any:
    """Recursively convert an autoangel pyclass (or primitive / list) into a
    JSON-compatible dict, calling every public getter along the way."""
    if obj is None or isinstance(obj, (bool, int, float, str)):
        return obj
    if isinstance(obj, (list, tuple)):
        return [to_dict(x) for x in obj]
    cls = type(obj)
    result: dict[str, Any] = _discriminator(cls)
    for name in cls.__dict__:
        if name.startswith("_"):
            continue
        attr = cls.__dict__[name]
        # Only read instance-level descriptors (pyo3 `get_all` getters);
        # skip class-level attributes (like sibling variants pyo3 exposes
        # on the complex-enum parent).
        if not hasattr(attr, "__get__") or isinstance(attr, type):
            continue
        result[name] = to_dict(getattr(obj, name))
    return result
