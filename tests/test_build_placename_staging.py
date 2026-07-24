import importlib.util
import unittest
from pathlib import Path


SCRIPT_PATH = Path(__file__).parents[1] / 'scripts' / 'build-placename-staging.py'
SPEC = importlib.util.spec_from_file_location('build_placename_staging', SCRIPT_PATH)
MODULE = importlib.util.module_from_spec(SPEC)
assert SPEC.loader is not None
SPEC.loader.exec_module(MODULE)


def make_live_row(uuid='LM00001'):
    return {
        'uuid': uuid,
        'type': '聚落',
        'name': '測試地名',
        'county': '臺南市',
        'town': '中西區',
        'longitude': 120.2,
        'latitude': 23.0,
        'row': 2,
    }


def make_new_row(uid, latitude=23.0, longitude=120.2):
    return {
        '__source_row__': 2,
        '地名UID': uid,
        '*PlaceId': 'TEST-001',
        '*地名類別(請填代號)': '2',
        '*地名名稱(中文)': '測試地名',
        '*所屬縣市': '臺南市',
        '*所屬鄉鎮': '中西區',
        '所屬村里': '測試里',
        '相關位置與面積描述': '位置描述',
        '地名沿革與文獻歷史簡述': '歷史描述',
        '標準地名代碼': '',
        '資料來源': '測試',
        '*緯度': latitude,
        '*經度': longitude,
    }


class CoordinateNormalizationTests(unittest.TestCase):
    def test_swapped_coordinates_are_corrected(self):
        self.assertEqual(
            MODULE.normalize_coordinates(120.2, 23.0),
            (23.0, 120.2, 'NEW_SWAPPED_CORRECTED'),
        )

    def test_zero_coordinate_is_invalid(self):
        self.assertEqual(
            MODULE.normalize_coordinates(0, 120.2),
            (None, None, 'NEW_INVALID_OR_ZERO'),
        )


class MatchingTests(unittest.TestCase):
    def test_unique_match_preserves_live_uuid(self):
        rows, summary = MODULE.build_staging(
            [make_live_row('LM00001')],
            [make_new_row('NEW-UID-1')],
            'test-batch',
        )
        indexes = {header: index for index, header in enumerate(MODULE.HEADERS)}

        self.assertEqual(rows[0][indexes['MatchStatus']], 'UNIQUE_MATCH')
        self.assertEqual(rows[0][indexes['StagingUUID']], 'LM00001')
        self.assertEqual(rows[0][indexes['OriginalUUID']], 'LM00001')
        self.assertEqual(summary['status_counts'], {'UNIQUE_MATCH': 1})

    def test_target_collision_keeps_new_inventory_uids(self):
        rows, summary = MODULE.build_staging(
            [make_live_row('LM00001')],
            [
                make_new_row('NEW-UID-1', latitude=24.0, longitude=121.0),
                make_new_row('NEW-UID-2', latitude=25.0, longitude=122.0),
            ],
            'test-batch',
        )
        indexes = {header: index for index, header in enumerate(MODULE.HEADERS)}

        self.assertEqual(
            [row[indexes['MatchStatus']] for row in rows],
            ['AMBIGUOUS_TARGET_COLLISION', 'AMBIGUOUS_TARGET_COLLISION'],
        )
        self.assertEqual(
            [row[indexes['StagingUUID']] for row in rows],
            ['NEW-UID-1', 'NEW-UID-2'],
        )
        self.assertEqual(summary['status_counts'], {'AMBIGUOUS_TARGET_COLLISION': 2})


if __name__ == '__main__':
    unittest.main()
