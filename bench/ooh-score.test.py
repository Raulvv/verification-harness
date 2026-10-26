import importlib.util, tempfile, unittest
from pathlib import Path

spec = importlib.util.spec_from_file_location('scorev2', 'bench/ooh-score-v2.py')
s = importlib.util.module_from_spec(spec)
spec.loader.exec_module(s)

class ScoreV2(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.corpus = Path(self.tmp.name)
        (self.corpus / 'a.md').write_text('# A\nAlpha pay is 10.\nGamma.\nBeta pay is 20.\n')
        self.table = self.corpus / 'table.md'
        self.table.write_text('| A | 10 |\n| B | 20 |\n')

    def tearDown(self):
        self.tmp.cleanup()

    def test_segments_and_evidence(self):
        self.assertEqual(s.segments('one | two | three'), ['one', 'two', 'three'])
        self.assertTrue(s.evidence_matches('Alpha pay is 10. Beta pay is 20.', 'Alpha pay is 10. | Beta pay is 20.'))
        self.assertFalse(s.evidence_matches('Alpha pay is 10.', 'Alpha pay is 11.'))

    def test_verbatim_segments_vs_contiguous(self):
        x = {'legs': [{'rel': 'a.md', 'quote': 'Alpha pay is 10. | Beta pay is 20.'}]}
        self.assertTrue(s.verbatim_legs(x, str(self.corpus), str(self.table)))
        self.assertFalse(s.contiguous_legs(x, str(self.corpus), str(self.table)))
        y = {'legs': [{'rel': 'a.md', 'quote': 'Alpha pay is 11.'}]}
        self.assertFalse(s.verbatim_legs(y, str(self.corpus), str(self.table)))

    def test_correct_conditions(self):
        ans = {'answer': '10'}
        t = {'condition': 'answerable', 'gold': 10, 'question': 'pay?'}
        self.assertTrue(s.correct(t, ans))
        self.assertFalse(s.correct(t, {'answer': 'NOT FOUND'}))
        u = {'condition': 'unanswerable', 'gold': 'NOT FOUND', 'question': 'pay?'}
        self.assertTrue(s.correct(u, {'answer': 'NOT FOUND', 'notFound': True}))
        self.assertFalse(s.correct(u, {'answer': '10'}))

if __name__ == '__main__':
    unittest.main()
