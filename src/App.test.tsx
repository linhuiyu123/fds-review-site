import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { App } from './App';

describe('practice interface', () => {
  it('keeps the main answer card focused on the question only before revealing', () => {
    const { container, queryByText } = render(<App />);
    const panel = container.querySelector('.question-panel');

    expect(queryByText('高频考点')).toBeNull();
    expect(panel?.textContent).toContain('1-1-1');
    expect(panel?.textContent).toContain('Prim');
    expect(panel?.textContent).toContain('Kruskal');
    expect(panel?.textContent).not.toContain('历年卷');
    expect(panel?.textContent).not.toContain('判断题');
    expect(panel?.textContent).not.toContain('Graph');
    expect(panel?.textContent).not.toContain('标准答案');
    expect(panel?.textContent).not.toContain('加入错题');
  });
});
