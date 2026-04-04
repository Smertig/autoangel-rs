import os

from autoangel import *


def test_read_configs():
    base_path = '../autoangel-core/resources/known_configs/'
    for file in os.listdir(base_path):
        path = f'{base_path}/{file}'
        config = read_elements_config(path)
        assert config.name == file

        with open(path, 'r') as f:
            config = read_elements_config_string(f.read())
            assert config.name is None
