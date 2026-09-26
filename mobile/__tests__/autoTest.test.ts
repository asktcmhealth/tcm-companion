import RNFS from 'react-native-fs';
import { readAutoTestPlan } from '../src/autoTest';

jest.mock('react-native-fs', () => ({
  __esModule: true,
  default: {
    DocumentDirectoryPath: '/docs',
    exists: jest.fn(),
    readFile: jest.fn(),
    appendFile: jest.fn(),
    writeFile: jest.fn(),
  },
}));

const fs = RNFS as unknown as { exists: jest.Mock; readFile: jest.Mock };

describe('readAutoTestPlan', () => {
  beforeEach(() => jest.resetAllMocks());

  it('does nothing when there is no plan file (every real user)', async () => {
    fs.exists.mockResolvedValue(false);
    expect(await readAutoTestPlan()).toBeNull();
    expect(fs.readFile).not.toHaveBeenCalled();
  });

  it('resolves the audio file inside the autotest folder', async () => {
    fs.exists.mockResolvedValue(true);
    fs.readFile.mockResolvedValue('{"audio":"audio.wav"}');
    expect(await readAutoTestPlan()).toEqual({ audioPath: '/docs/autotest/audio.wav' });
  });

  it('rejects a plan that points outside the folder', async () => {
    fs.exists.mockResolvedValue(true);
    fs.readFile.mockResolvedValue('{"audio":"../secret.wav"}');
    expect(await readAutoTestPlan()).toBeNull();
  });

  it('ignores a corrupt plan file', async () => {
    fs.exists.mockResolvedValue(true);
    fs.readFile.mockResolvedValue('not json');
    expect(await readAutoTestPlan()).toBeNull();
  });
});
