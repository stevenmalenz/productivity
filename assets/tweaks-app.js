/* global React, ReactDOM */
const { useEffect } = React;

const TWEAK_DEFAULTS = /*EDITMODE-BEGIN*/{
  "counterStyle": "count",
  "cardSize": "calm",
  "showHints": true,
  "ambientBreathe": true
}/*EDITMODE-END*/;

function TweaksApp() {
  const [t, setTweak] = window.useTweaks(TWEAK_DEFAULTS);

  useEffect(() => {
    if (window.__onething) window.__onething.setCounterStyle(t.counterStyle);
  }, [t.counterStyle]);

  useEffect(() => {
    const card = document.getElementById('card');
    const thing = document.getElementById('thing');
    const wrap = document.getElementById('cardwrap');
    if (!card || !thing || !wrap) return;
    if (t.cardSize === 'compact') {
      card.style.padding = '36px 28px 28px';
      thing.style.fontSize = '32px';
      thing.style.letterSpacing = '-0.8px';
      wrap.style.width = 'min(440px, 86vw)';
    } else if (t.cardSize === 'massive') {
      card.style.padding = '72px 56px 56px';
      thing.style.fontSize = '64px';
      thing.style.letterSpacing = '-2px';
      wrap.style.width = 'min(720px, 92vw)';
    } else {
      card.style.padding = '';
      thing.style.fontSize = '';
      thing.style.letterSpacing = '';
      wrap.style.width = '';
    }
  }, [t.cardSize]);

  useEffect(() => {
    const hint = document.getElementById('hint');
    if (hint) hint.style.display = t.showHints ? '' : 'none';
  }, [t.showHints]);

  useEffect(() => {
    const card = document.getElementById('card');
    if (!card) return;
    card.style.animation = t.ambientBreathe ? '' : 'none';
  }, [t.ambientBreathe]);

  return (
    <window.TweaksPanel title="Tweaks">
      <window.TweakSection label="Counter">
        <window.TweakRadio
          label="Style"
          value={t.counterStyle}
          onChange={(v) => setTweak('counterStyle', v)}
          options={[
            { value: 'count',  label: 'Count' },
            { value: 'expand', label: 'Hover' },
            { value: 'mini',   label: 'Stack' },
          ]}
        />
      </window.TweakSection>

      <window.TweakSection label="Card">
        <window.TweakRadio
          label="Size"
          value={t.cardSize}
          onChange={(v) => setTweak('cardSize', v)}
          options={[
            { value: 'compact', label: 'Compact' },
            { value: 'calm',    label: 'Calm' },
            { value: 'massive', label: 'Massive' },
          ]}
        />
        <window.TweakToggle
          label="Ambient breathe"
          value={t.ambientBreathe}
          onChange={(v) => setTweak('ambientBreathe', v)}
        />
        <window.TweakToggle
          label="Show hints"
          value={t.showHints}
          onChange={(v) => setTweak('showHints', v)}
        />
      </window.TweakSection>
    </window.TweaksPanel>
  );
}

const tweaksRoot = document.createElement('div');
tweaksRoot.id = '__tweaks_root';
document.body.appendChild(tweaksRoot);
ReactDOM.createRoot(tweaksRoot).render(<TweaksApp />);
