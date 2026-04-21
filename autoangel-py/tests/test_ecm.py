"""Tests for ``EcmModel`` accessors (``get_event``, ``get_bone_scale``, ``get_child``)."""
import autoangel


def test_get_event_fallen_general_gfx_event():
    """Action 0, event 0 of fallen_general is the known GFX event (EventType 100, gfx_scale ~= 0.8)."""
    with open('../test_data/models/fallen_general/fallen_general.ecm', 'rb') as f:
        ecm = autoangel.read_ecm(f.read())

    ev = ecm.get_event(0, 0)
    assert ev is not None
    assert isinstance(ev, autoangel.EcmEvent)
    assert ev.event_type == 100
    assert ev.gfx_scale is not None
    assert abs(ev.gfx_scale - 0.8) < 0.01
    # Sound-only fields are absent for GFX events.
    assert ev.volume is None
    # hook_offset is a [f32; 3] → 3-tuple.
    assert len(ev.hook_offset) == 3
    # Base fields are always typed correctly.
    assert isinstance(ev.start_time, int)
    assert isinstance(ev.time_span, int)
    assert isinstance(ev.once, bool)
    assert isinstance(ev.fx_file_path, str)
    assert isinstance(ev.hook_name, str)


def test_get_event_fallen_general_sound_event():
    """Action 3, event 0 of fallen_general is the known Sound event (EventType 101, volume 100)."""
    with open('../test_data/models/fallen_general/fallen_general.ecm', 'rb') as f:
        ecm = autoangel.read_ecm(f.read())

    ev = ecm.get_event(3, 0)
    assert ev is not None
    assert ev.event_type == 101
    assert ev.volume == 100
    # GFX-only fields are absent for Sound events.
    assert ev.gfx_scale is None


def test_get_event_out_of_bounds_returns_none():
    with open('../test_data/models/fallen_general/fallen_general.ecm', 'rb') as f:
        ecm = autoangel.read_ecm(f.read())

    assert ecm.get_event(99, 99) is None
    assert ecm.get_event(0, 99) is None


def test_get_child_fallen_general():
    """fallen_general has two weapon-attachment child models; verify field shape."""
    with open('../test_data/models/fallen_general/fallen_general.ecm', 'rb') as f:
        ecm = autoangel.read_ecm(f.read())

    assert ecm.child_count == 2

    c0 = ecm.get_child(0)
    assert c0 is not None
    assert isinstance(c0, autoangel.ChildModel)
    assert c0.name == "wq_l"
    assert c0.hh_name == "HH_lefthandweapon"
    assert c0.cc_name == "CC_weapon"
    assert isinstance(c0.path, str)

    c1 = ecm.get_child(1)
    assert c1 is not None
    assert c1.name == "wq_r"
    assert c1.hh_name == "HH_righthandweapon"


def test_get_child_out_of_bounds_returns_none():
    with open('../test_data/models/fallen_general/fallen_general.ecm', 'rb') as f:
        ecm = autoangel.read_ecm(f.read())

    assert ecm.get_child(99) is None


def test_get_bone_scale_out_of_bounds_returns_none():
    """fallen_general has no bone scales; any index is out of bounds."""
    with open('../test_data/models/fallen_general/fallen_general.ecm', 'rb') as f:
        ecm = autoangel.read_ecm(f.read())

    assert ecm.bone_scale_count == 0
    assert ecm.get_bone_scale(0) is None
