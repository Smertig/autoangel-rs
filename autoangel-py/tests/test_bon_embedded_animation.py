import pathlib
import autoangel

REPO_ROOT = pathlib.Path(__file__).resolve().parents[2]
BON = REPO_ROOT / "test_data" / "models" / "carnivore_plant" / "花苞食人花_b.bon"


def test_carnivore_plant_embedded_animation():
    data = BON.read_bytes()
    skel = autoangel.read_skeleton(data)
    assert skel.embedded_animation is not None
    anim = skel.embedded_animation
    assert anim.anim_start == 0
    assert anim.anim_end == 407
    assert anim.anim_fps == 15
    assert len(anim.bone_tracks) == 26
    bt0 = anim.bone_tracks[0]
    assert bt0.bone_id == 0
    assert bt0.position.frame_rate == 15
    assert len(bt0.position.keys) % 3 == 0
    assert len(bt0.rotation.keys) % 4 == 0
