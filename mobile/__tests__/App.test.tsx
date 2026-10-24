/**
 * Smoke tests for the real screen, with the native layer mocked (speech model,
 * filesystem, microphone). Covers the states a physician actually meets:
 * first launch, model present, the results screen, and recovering from errors.
 *
 * @format
 */

import React from 'react';
import { Text, TextInput } from 'react-native';
import ReactTestRenderer, { act, type ReactTestInstance } from 'react-test-renderer';
import App from '../App';
import { MODEL_BYTES } from '../src/whisperModel';

jest.mock('react-native-safe-area-context', () => require('react-native-safe-area-context/jest/mock').default);
jest.mock('whisper.rn/index', () => ({ initWhisper: jest.fn() }));
jest.mock('whisper.rn/realtime-transcription/adapters/AudioPcmStreamAdapter', () => ({
  AudioPcmStreamAdapter: class {},
}));
jest.mock('@sayem314/react-native-keep-awake', () => ({ activateKeepAwake: jest.fn(), deactivateKeepAwake: jest.fn() }));
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
    readFile: jest.fn(),
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

describe('saved draft', () => {
  const herb = {
    name: '柴胡', dosage: 10, unit: 'g', dbConfirmed: true, dosageWarning: false,
    dosageCheckMessage: '', highRisk: false, ambiguous: false,
  };
  const saved = (over: Record<string, unknown> = {}) =>
    JSON.stringify({
      version: 1, savedAt: new Date().toISOString(), herbs: [herb], points: [],
      prescriptionSectionFound: true, confirmed: [0], herbEdits: {}, pointEdits: {}, review: null, ...over,
    });
  afterEach(() => RNFS.readFile.mockReset());

  it('restores ticks and corrections after a restart, and has no transcript to show', async () => {
    modelIsPresent();
    RNFS.readFile.mockImplementation(async (path: string) => (path.endsWith('draft.json') ? saved() : '{}'));
    const tree = await launch();
    const text = screenText(tree);
    expect(text).toContain('柴胡');
    expect(text).toContain('Restored your draft');
    expect(text).toContain('1 of 1');
    expect(text).not.toContain('Show transcript');
  });

  it('does not restore a draft that is older than the retention window', async () => {
    modelIsPresent();
    const old = new Date(Date.now() - 40 * 24 * 60 * 60 * 1000).toISOString();
    RNFS.readFile.mockImplementation(async (path: string) => (path.endsWith('draft.json') ? saved({ savedAt: old }) : '{}'));
    const tree = await launch();
    expect(screenText(tree)).not.toContain('Restored your draft');
    expect(RNFS.unlink).toHaveBeenCalledWith(expect.stringContaining('draft.json'));
  });

  it('saves the work after a change, without the transcript', async () => {
    modelIsPresent();
    const tree = await launch();
    await press(tree, 'Run pipeline on sample text');
    const box = tree.root.findAll(n => n.props.accessibilityRole === 'checkbox' && typeof n.props.onPress === 'function')[0];
    await act(async () => box.props.onPress());
    await act(async () => {
      await new Promise(r => setTimeout(r, 600));
    });
    const call = RNFS.writeFile.mock.calls.filter((c: string[]) => c[0].endsWith('draft.json')).at(-1);
    expect(call).toBeDefined();
    const stored = JSON.parse(call[1]);
    expect(stored.confirmed).toEqual([0]);
    expect(stored.herbs.length).toBeGreaterThan(10);
    expect(call[1]).not.toContain('今天来的病人');
  });

  it('Clear draft deletes the saved file and the results', async () => {
    modelIsPresent();
    const tree = await launch();
    await press(tree, 'Run pipeline on sample text');
    expect(screenText(tree)).toContain('Prescription draft');
    await press(tree, 'Clear draft');
    expect(RNFS.unlink).toHaveBeenCalledWith(expect.stringContaining('draft.json'));
    expect(screenText(tree)).not.toContain('Doses checked against the recording');
  });
});

describe('keeping the screen on', () => {
  const keepAwake = jest.requireMock('@sayem314/react-native-keep-awake');

  it('holds the screen on only while transcribing, and lets go afterwards', async () => {
    modelIsPresent();
    let finish!: (v: { result: string }) => void;
    initWhisper.mockResolvedValue({
      release: jest.fn(),
      transcribe: jest.fn(() => ({ promise: new Promise(resolve => (finish = resolve)) })),
    });
    const tree = await launch();
    expect(keepAwake.activateKeepAwake).not.toHaveBeenCalled();

    await press(tree, 'Transcribe sample audio');
    expect(keepAwake.activateKeepAwake).toHaveBeenCalledTimes(1);
    expect(keepAwake.deactivateKeepAwake).not.toHaveBeenCalled();

    await act(async () => finish({ result: '处方：柴胡10克' }));
    await flush();
    expect(keepAwake.deactivateKeepAwake).toHaveBeenCalledTimes(1);
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

  it('starts with no dose confirmed, counts ticks, and resets for a new result', async () => {
    modelIsPresent();
    const tree = await launch();
    await press(tree, 'Run pipeline on sample text');
    expect(screenText(tree)).toContain('0 of ');

    const boxes = () => tree.root.findAll(n => n.props.accessibilityRole === 'checkbox' && typeof n.props.onPress === 'function');
    expect(boxes().length).toBeGreaterThan(2);
    expect(boxes().every(b => b.props.accessibilityState.checked === false)).toBe(true);

    await act(async () => boxes()[0].props.onPress());
    await act(async () => boxes()[1].props.onPress());
    expect(screenText(tree)).toContain('2 of ');
    expect(boxes()[0].props.accessibilityState.checked).toBe(true);

    await act(async () => boxes()[0].props.onPress()); // untick
    expect(screenText(tree)).toContain('1 of ');

    await press(tree, 'Run pipeline on sample text'); // a fresh result starts clean
    expect(screenText(tree)).toContain('0 of ');
  });

  it('lets the physician keep, swap, retype and undo, and resets the dose tick when something changes', async () => {
    modelIsPresent();
    const tree = await launch();
    await press(tree, 'Run pipeline on sample text');

    const bannerBefore = /(\d+) uncertain match/.exec(screenText(tree));
    expect(bannerBefore).not.toBeNull();
    const flaggedBefore = Number(bannerBefore![1]);
    expect(screenText(tree)).not.toContain('You changed this');

    // swap the first uncertain herb to the alternative the app showed
    const checkboxes = () =>
      tree.root.findAll(n => n.props.accessibilityRole === 'checkbox' && typeof n.props.onPress === 'function');
    await act(async () => checkboxes()[0].props.onPress());
    expect(screenText(tree)).toContain('1 of ');
    await press(tree, 'Use ');
    expect(screenText(tree)).toContain('You changed this');
    expect(screenText(tree)).toContain('Edited');
    const afterSwap = /(\d+) uncertain match/.exec(screenText(tree));
    expect(afterSwap ? Number(afterSwap[1]) : 0).toBeLessThan(flaggedBefore);

    // undo puts the engine's reading back
    await press(tree, 'Undo');
    expect(screenText(tree)).not.toContain('You changed this');

    // keep settles the flag without changing the herb
    await press(tree, 'Keep ');
    expect(screenText(tree)).toContain('Confirmed');
    expect(screenText(tree)).not.toContain('You changed this');

    // retype a dose; a bad entry is refused, a good one applies and is re-checked
    await press(tree, 'Edit dose');
    const input = () => tree.root.findByType(TextInput);
    await act(async () => input().props.onChangeText('abc'));
    await press(tree, 'Save');
    expect(screenText(tree)).toContain('Enter the dose in grams');
    await act(async () => input().props.onChangeText('250'));
    await press(tree, 'Save');
    expect(screenText(tree)).toContain('250');
    expect(screenText(tree)).toContain('OUTSIDE typical range');
    expect(screenText(tree)).toContain('You changed this');
  });

  it('only allows "Mark as reviewed" when everything is checked and settled, and withdraws it on any change', async () => {
    modelIsPresent();
    const tree = await launch();
    await press(tree, 'Run pipeline on sample text');

    const reviewButton = () =>
      tree.root.find(n => n.props.accessibilityRole === 'button' && textOf(n).includes('Mark as reviewed') && typeof n.props.onPress === 'function');
    expect(reviewButton().props.disabled).toBe(true);
    expect(screenText(tree)).toContain('not yet checked');
    expect(screenText(tree)).toContain('uncertain match');

    const keepButtons = () =>
      tree.root.findAll(n => typeof n.props.onPress === 'function' && n.props.accessibilityRole === 'button' && /^Keep /.test(textOf(n)));
    for (let guard = 0; guard < 20 && keepButtons().length > 0; guard++) {
      await act(async () => keepButtons().at(-1)!.props.onPress());
    }
    expect(reviewButton().props.disabled).toBe(true); // still unticked doses

    const boxes = () => tree.root.findAll(n => n.props.accessibilityRole === 'checkbox' && typeof n.props.onPress === 'function');
    const total = boxes().length;
    for (let i = 0; i < total; i++) {
      await act(async () => boxes()[i].props.onPress());
    }
    expect(reviewButton().props.disabled).toBe(false);

    await act(async () => reviewButton().props.onPress());
    expect(screenText(tree)).toContain('Reviewed by physician,');
    expect(() => reviewButton()).toThrow();

    // changing anything afterwards cancels the review
    await act(async () => boxes()[0].props.onPress());
    expect(screenText(tree)).not.toContain('Reviewed by physician,');
    expect(reviewButton().props.disabled).toBe(true);
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
