/**
 * Smoke tests for the real screen, with the native layer mocked (speech model,
 * filesystem, microphone). Covers the states a physician actually meets:
 * first launch, model present, the results screen, and recovering from errors.
 *
 * @format
 */

import React from 'react';
import { Text } from 'react-native';
import ReactTestRenderer, { act, type ReactTestInstance } from 'react-test-renderer';
import App from '../App';
import { MODEL_BYTES } from '../src/whisperModel';

jest.mock('react-native-safe-area-context', () => require('react-native-safe-area-context/jest/mock').default);
jest.mock('whisper.rn/index', () => ({ initWhisper: jest.fn() }));
jest.mock('whisper.rn/realtime-transcription/adapters/AudioPcmStreamAdapter', () => ({
  AudioPcmStreamAdapter: class {},
}));
jest.mock('react-native-fs', () => ({
  __esModule: true,
  default: {
    DocumentDirectoryPath: '/docs',
    LibraryDirectoryPath: '/lib',
    CachesDirectoryPath: '/cache',
    exists: jest.fn(),
    stat: jest.fn(),
    unlink: jest.fn(),
    mkdir: jest.fn(),
    moveFile: jest.fn(),
    getFSInfo: jest.fn(),
    downloadFile: jest.fn(),
    writeFile: jest.fn(),
    appendFile: jest.fn(),
    read: jest.fn(),
  },
}));

const RNFS = jest.requireMock('react-native-fs').default;
const { initWhisper } = jest.requireMock('whisper.rn/index');

// Rendering the whole app loads the correction engine and its dictionaries; the
// first test in a file pays that cost, which can exceed Jest's 5s default on a busy machine.
jest.setTimeout(30000);

const flush = () => act(async () => { await new Promise(r => setTimeout(r, 0)); });

async function launch(): Promise<ReactTestRenderer.ReactTestRenderer> {
  let tree!: ReactTestRenderer.ReactTestRenderer;
  await act(async () => {
    tree = ReactTestRenderer.create(<App />);
  });
  await flush();
  return tree;
}

const screenText = (tree: ReactTestRenderer.ReactTestRenderer) => JSON.stringify(tree.toJSON());

const textOf = (node: ReactTestInstance) =>
  node.findAllByType(Text).map(t => [t.props.children].flat(Infinity).join('')).join(' ');

async function press(tree: ReactTestRenderer.ReactTestRenderer, label: string) {
  const target = tree.root
    .findAll(n => typeof n.props.onPress === 'function' && textOf(n).includes(label))
    .at(-1); // the innermost pressable carrying that label
  if (!target) throw new Error(`No pressable with text "${label}". Screen: ${screenText(tree).slice(0, 400)}`);
  await act(async () => {
    target.props.onPress();
  });
  await flush();
}

const modelIsPresent = () => {
  RNFS.exists.mockResolvedValue(true);
  RNFS.stat.mockResolvedValue({ size: MODEL_BYTES });
};

beforeEach(() => {
  jest.clearAllMocks();
  RNFS.unlink.mockResolvedValue(undefined);
  RNFS.mkdir.mockResolvedValue(undefined);
  RNFS.getFSInfo.mockResolvedValue({ freeSpace: 10_000_000_000, totalSpace: 64_000_000_000 });
  initWhisper.mockResolvedValue({ release: jest.fn(), transcribe: jest.fn() });
});

describe('first launch', () => {
  it('asks before downloading the 539MB model and does not start it on its own', async () => {
    RNFS.exists.mockResolvedValue(false);
    const tree = await launch();
    const text = screenText(tree);
    expect(text).toContain('One-time setup');
    expect(text).toContain('539');
    expect(text).toContain('Download speech model');
    expect(RNFS.downloadFile).not.toHaveBeenCalled();
    expect(initWhisper).not.toHaveBeenCalled();
  });

  it('treats a truncated model file as not downloaded (and removes it) instead of loading a corrupt model', async () => {
    RNFS.exists.mockResolvedValue(true);
    RNFS.stat.mockResolvedValue({ size: MODEL_BYTES - 1000 });
    const tree = await launch();
    expect(screenText(tree)).toContain('Download speech model');
    expect(RNFS.unlink).toHaveBeenCalled();
    expect(initWhisper).not.toHaveBeenCalled();
  });
});

describe('model present', () => {
  it('loads the model and shows the Record button', async () => {
    modelIsPresent();
    const tree = await launch();
    expect(initWhisper).toHaveBeenCalledTimes(1);
    expect(screenText(tree)).toContain('Record');
    expect(screenText(tree)).toContain('Runs fully offline');
  });

  it('can be switched to Chinese', async () => {
    modelIsPresent();
    const tree = await launch();
    await press(tree, '中文');
    expect(screenText(tree)).toContain('录音');
    expect(screenText(tree)).toContain('完全离线运行');
  });
});

describe('recovering from errors', () => {
  it('shows the failure and a Try again that actually retries (this screen used to be a dead end)', async () => {
    modelIsPresent();
    initWhisper.mockRejectedValueOnce(new Error('out of memory'));
    const tree = await launch();
    expect(screenText(tree)).toContain('out of memory');
    expect(screenText(tree)).toContain('Try again');
    expect(screenText(tree)).not.toContain('"Record"');

    await press(tree, 'Try again');
    expect(initWhisper).toHaveBeenCalledTimes(2);
    expect(screenText(tree)).not.toContain('out of memory');
    expect(screenText(tree)).toContain('Record');
  });

  it('reports a failed download and offers to retry from the setup screen', async () => {
    RNFS.exists.mockResolvedValue(false);
    RNFS.getFSInfo.mockResolvedValue({ freeSpace: 100_000_000, totalSpace: 64_000_000_000 });
    const tree = await launch();
    await press(tree, 'Download speech model');
    expect(screenText(tree)).toContain('Not enough free storage');
    expect(screenText(tree)).toContain('Try again');
    expect(RNFS.downloadFile).not.toHaveBeenCalled(); // refused up front, before any bytes were fetched
  });
});

describe('results screen (dev sample: real garbled output)', () => {
  it('shows flagged herbs, the review banner, and the acupuncture section', async () => {
    modelIsPresent();
    const tree = await launch();
    await press(tree, 'Run pipeline on sample text');
    const text = screenText(tree);

    expect(text).toContain('Prescription draft');
    expect(text).toContain('Requires physician review before sign-off.');
    expect(text).toContain('Check before sign-off:');
    expect(text).toContain('uncertain match');
    expect(text).toContain('Verify');
    expect(text).toContain('High-risk herb');
    expect(text).toContain('Acupuncture treatment');
    for (const herb of ['制附子', '肉桂', '熟地黄', '牛膝', '桃仁', '炙甘草', '合谷', '足三里']) {
      expect(text).toContain(herb);
    }
  });

  it('keeps the transcript hidden until asked for', async () => {
    modelIsPresent();
    const tree = await launch();
    await press(tree, 'Run pipeline on sample text');
    expect(screenText(tree)).not.toContain('辨证为');
    await press(tree, 'Show transcript');
    expect(screenText(tree)).toContain('辨证为');
    await press(tree, 'Hide transcript');
    expect(screenText(tree)).not.toContain('辨证为');
  });
});
