import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import TechStack from '../components/TechStack';

describe('tech stack disclosure', () => {
  it('reveals every technology and consumes Escape before the surrounding sheet', () => {
    render(<TechStack technologies={['React', 'FastAPI', 'PostgreSQL']} />);
    const trigger = screen.getByRole('button', { name: /Tech stack/ });
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    fireEvent.click(trigger);
    expect(trigger).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getAllByRole('listitem')).toHaveLength(3);
    const close = screen.getByRole('button', { name: 'Close tech stack' });
    expect(close).toHaveFocus();
    const closeSheet = vi.fn();
    document.addEventListener('keydown', closeSheet);
    try {
      fireEvent.keyDown(close, { key: 'Escape' });
      expect(closeSheet).not.toHaveBeenCalled();
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
      expect(trigger).toHaveFocus();
    } finally {
      document.removeEventListener('keydown', closeSheet);
    }
  });

  it('supports toggle, close button and outside-pointer dismissal', () => {
    render(<><TechStack technologies={['React']} /><button>Outside</button></>);
    const trigger = screen.getByRole('button', { name: /Tech stack/ });
    fireEvent.click(trigger);
    fireEvent.click(trigger);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    fireEvent.click(trigger);
    fireEvent.click(screen.getByRole('button', { name: 'Close tech stack' }));
    expect(trigger).toHaveFocus();
    fireEvent.click(trigger);
    fireEvent.pointerDown(screen.getByRole('button', { name: 'Outside' }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });
});
