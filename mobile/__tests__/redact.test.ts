import { redactIdentifiers } from '../src/redact';

describe('redactIdentifiers', () => {
  it('removes a name spoken after "patient is" (the case seen on the tablet)', () => {
    const out = redactIdentifiers('hello today patient is julie low');
    expect(out).not.toMatch(/julie|low/i);
    expect(out).toContain('[NAME]');
  });

  it('stops a spoken name at the next ordinary word', () => {
    const out = redactIdentifiers('patient is Mary Tan and has a cough');
    expect(out).toBe('patient is [NAME] and has a cough');
  });

  it('does not eat the description that follows "patient is"', () => {
    expect(redactIdentifiers('the patient is a 42 year old woman')).toBe('the patient is a [AGE] year old woman');
  });

  it('handles titles and "called"', () => {
    expect(redactIdentifiers('this is Mr Lim today')).toContain('[NAME]');
    expect(redactIdentifiers('her mother called Susan Wong came')).not.toMatch(/Susan|Wong/);
  });

  it('removes a Chinese name after an introducing phrase, keeping herb names intact', () => {
    const out = redactIdentifiers('今天来的病人叫张三，处方如下：陈皮6g白术15g白芍15g');
    expect(out).toContain('叫[姓名]');
    expect(out).not.toContain('张三');
    expect(out).toContain('陈皮6g白术15g白芍15g');
  });

  it('removes NRIC (including a one-digit-off ASR misreading) and phone numbers', () => {
    const out = redactIdentifiers('NRIC是S987643G,电话是81234567,or +65 9123 4567.');
    expect(out).not.toMatch(/S987643G|81234567|9123/);
    expect(out).toContain('[ID]');
    expect(out).toContain('[PHONE]');
  });

  it('removes ages but never doses', () => {
    const out = redactIdentifiers('42岁的女性,柴胡10克,当归10g');
    expect(out).toBe('[AGE]岁的女性,柴胡10克,当归10g');
  });

  it('leaves ordinary text alone', () => {
    const text = '情绪方面她最近比较容易烦躁,处方如下:柴胡10克';
    expect(redactIdentifiers(text)).toBe(text);
  });
});
