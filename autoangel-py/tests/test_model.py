import autoangel


def test_read_ecm_carnivore_plant():
    with open('../test_data/models/carnivore_plant/carnivore_plant.ecm', 'rb') as f:
        ecm = autoangel.read_ecm(f.read())
    assert ecm.version == 21
    assert ecm.skin_model_path == 'carnivore_plant.SMD'
    assert ecm.additional_skins == ['carnivore_plant.SKI']
    assert ecm.bone_scale_count == 0
    assert ecm.child_count == 0
    assert ecm.org_color == 0xFFFFFFFF


def test_read_ecm_fallen_general():
    with open('../test_data/models/fallen_general/fallen_general.ecm', 'rb') as f:
        ecm = autoangel.read_ecm(f.read())
    assert ecm.version == 21
    assert ecm.skin_model_path == 'fallen_general.SMD'
    assert ecm.additional_skins == ['fallen_general.ski']
    assert ecm.child_count == 2
    c0 = ecm.get_child(0)
    assert c0 is not None
    assert c0.name == 'wq_l'
    assert c0.hh_name == 'HH_lefthandweapon'
    assert c0.cc_name == 'CC_weapon'
    c1 = ecm.get_child(1)
    assert c1 is not None
    assert c1.name == 'wq_r'
    assert c1.hh_name == 'HH_righthandweapon'


def test_read_ecm_invalid():
    try:
        autoangel.read_ecm(b'not a valid ecm')
        assert False, 'should have raised'
    except ValueError:
        pass


def test_ecm_repr():
    with open('../test_data/models/carnivore_plant/carnivore_plant.ecm', 'rb') as f:
        ecm = autoangel.read_ecm(f.read())
    r = repr(ecm)
    assert 'EcmModel(' in r
    assert 'carnivore_plant.SMD' in r


# --- SMD tests ---

def test_read_smd_carnivore_plant():
    with open('../test_data/models/carnivore_plant/carnivore_plant.smd', 'rb') as f:
        smd = autoangel.read_smd(f.read())
    assert smd.version == 5
    assert len(smd.skin_paths) == 1
    assert smd.skeleton_path.endswith('.bon')


def test_read_smd_fallen_general():
    with open('../test_data/models/fallen_general/fallen_general.smd', 'rb') as f:
        smd = autoangel.read_smd(f.read())
    assert smd.version == 5
    assert len(smd.skin_paths) == 0
    assert smd.skeleton_path.endswith('.bon')


def test_read_smd_invalid():
    try:
        autoangel.read_smd(b'\xDE\xAD\xBE\xEF' + b'\x00' * 92)
        assert False, 'should have raised'
    except ValueError:
        pass


# --- Skeleton (BON) tests ---

def test_read_skeleton_carnivore_plant():
    with open('../test_data/models/carnivore_plant/花苞食人花_b.bon', 'rb') as f:
        skel = autoangel.read_skeleton(f.read())
    assert skel.version == 5
    assert len(skel.bones) == 26
    assert len(skel.hooks) == 3
    assert skel.bones[0].parent == -1
    assert len(skel.bones[0].mat_relative) == 16
    assert len(skel.bones[0].mat_bone_init) == 16


def test_read_skeleton_fallen_general():
    with open('../test_data/models/fallen_general/兵殇将军.bon', 'rb') as f:
        skel = autoangel.read_skeleton(f.read())
    assert skel.version == 5
    assert len(skel.bones) == 33
    assert len(skel.hooks) == 5


def test_read_skeleton_invalid():
    try:
        autoangel.read_skeleton(b'\xDE\xAD\xBE\xEF' + b'\x00' * 92)
        assert False, 'should have raised'
    except ValueError:
        pass


# --- Skin (SKI) tests ---

def test_read_skin_carnivore_plant():
    with open('../test_data/models/carnivore_plant/carnivore_plant.ski', 'rb') as f:
        skin = autoangel.read_skin(f.read())
    assert skin.version == 8
    assert len(skin.skin_meshes) == 2
    assert len(skin.rigid_meshes) == 0
    assert len(skin.textures) == 2
    assert len(skin.materials) == 2
    mesh = skin.skin_meshes[0]
    assert len(mesh.positions) > 0
    assert len(mesh.positions) % 3 == 0
    assert len(mesh.normals) == len(mesh.positions)
    assert len(mesh.uvs) == len(mesh.positions) // 3 * 2
    assert len(mesh.indices) > 0
    assert len(mesh.bone_weights) == len(mesh.positions) // 3 * 4
    assert len(mesh.bone_indices) == len(mesh.positions) // 3 * 4


def test_read_skin_fallen_general():
    with open('../test_data/models/fallen_general/fallen_general.ski', 'rb') as f:
        skin = autoangel.read_skin(f.read())
    assert skin.version == 8
    assert len(skin.skin_meshes) == 2
    assert len(skin.textures) == 2


def test_read_skin_invalid():
    try:
        autoangel.read_skin(b'\xDE\xAD\xBE\xEF' + b'\x00' * 100)
        assert False, 'should have raised'
    except ValueError:
        pass


# --- TrackSet (STCK) tests ---

def test_read_track_set_v1_static():
    with open('../test_data/models/stck_v1_static.stck', 'rb') as f:
        ts = autoangel.read_track_set(f.read())
    assert ts.version == 1
    assert ts.anim_fps == 15
    assert len(ts.bone_tracks) == 1
    assert len(ts.bone_tracks[0].position.keys) == 3
    assert len(ts.bone_tracks[0].rotation.keys) == 4
    assert ts.bone_tracks[0].position.key_frame_ids is None


def test_read_track_set_v1_animated():
    with open('../test_data/models/stck_v1_animated.stck', 'rb') as f:
        ts = autoangel.read_track_set(f.read())
    assert ts.version == 1
    assert ts.anim_fps == 15
    assert ts.anim_end == 70
    assert len(ts.bone_tracks) == 5
    assert len(ts.bone_tracks[1].position.keys) > 3
    assert len(ts.bone_tracks[2].rotation.keys) > 4


def test_read_track_set_v2_static():
    with open('../test_data/models/stck_v2_static.stck', 'rb') as f:
        ts = autoangel.read_track_set(f.read())
    assert ts.version == 2
    assert len(ts.bone_tracks) == 1


def test_read_track_set_v2_animated():
    with open('../test_data/models/stck_v2_animated.stck', 'rb') as f:
        ts = autoangel.read_track_set(f.read())
    assert ts.version == 2
    assert ts.anim_fps == 30
    assert ts.anim_end == 100
    assert len(ts.bone_tracks) == 25
    assert len(ts.bone_tracks[0].rotation.keys) % 4 == 0


def test_read_track_set_invalid():
    try:
        autoangel.read_track_set(b'\xDE\xAD\xBE\xEF' + b'\x00' * 20)
        assert False, 'should have raised'
    except ValueError:
        pass
