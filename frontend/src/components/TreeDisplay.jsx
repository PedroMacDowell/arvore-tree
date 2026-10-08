import { useId, useRef, useState } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import { CARE_DAYS, STAGES } from '../constants';
import './TreeDisplay.css';

const NOTES = [
  'Toda floresta começa em silêncio. Sob a terra, uma semente prepara seu primeiro encontro com a luz.',
  'As primeiras folhas se abrem. Ao mesmo tempo, raízes delicadas encontram seu caminho pelo solo.',
  'Cada nova raiz sustenta uma nova possibilidade. Sua muda começa a ocupar seu lugar na floresta.',
  'O tronco se fortalece, os galhos se abrem. O cuidado de hoje se transforma na sombra de amanhã.',
  'Uma copa generosa, uma rede de raízes. Sua árvore é parte de uma história que continua crescendo.',
  'Da pequena semente à grande sumaúma. Uma história de cuidado, enraizada na Amazônia.',
];

function Leaf({ x, y, angle = 0, size = 1, color = '#57794b' }) {
  return <g transform={`translate(${x} ${y}) rotate(${angle}) scale(${size})`}>
    <path d="M0 0 C-19 -7 -29 -27 -22 -43 C-4 -40 10 -18 0 0Z" fill={color}/>
    <path d="M0 0 Q-10 -21 -22 -40" fill="none" stroke="#d7dda3" strokeOpacity=".45" strokeWidth=".8"/>
  </g>;
}

/** Desenho da sumaúma: cresce entre um estágio e o próximo conforme `progress` (0–100). */
function BotanicalTree({ stage, progress, id }) {
  const sizes = [0, .24, .43, .64, .84, 1];
  const size = sizes[stage] + ((sizes[stage + 1] ?? 1.04) - sizes[stage]) * progress / 100;
  const rootSizes = [.2, .33, .48, .65, .83, 1];
  const roots = rootSizes[stage] + ((rootSizes[stage + 1] ?? 1.04) - rootSizes[stage]) * progress / 100;
  return <>
    <defs>
      <linearGradient id={id} x1="0" x2="1"><stop stopColor="#514434"/><stop offset=".45" stopColor="#928467"/><stop offset=".7" stopColor="#756a50"/><stop offset="1" stopColor="#423d2e"/></linearGradient>
    </defs>
    <g className="garden-growing-part" style={{ transform: `translate(400px, 440px) scale(${roots})` }} fill="none" stroke="#c4a77b" strokeLinecap="round">
      {[-1, 1].map(side => <g key={side} transform={`scale(${side} 1)`}>
        <path d="M0 0 C20 30 54 23 81 51 S159 80 213 105" strokeWidth="5"/>
        <path d="M3 2 C15 49 32 56 38 89 S58 124 76 141 M44 32 Q73 33 103 24 T169 37 M85 53 Q98 91 124 118 M137 79 Q170 62 198 72" strokeWidth="2.7"/>
        <path d="M37 87 Q18 112 29 140 M61 42 Q49 64 60 81 M122 115 L147 134 M166 90 L183 122 M107 25 L132 11 M193 99 L231 98 M76 139 L70 155" strokeWidth="1.1"/>
      </g>)}
      <path d="M0 0 Q-12 50 0 89 T-7 163 M-3 101 Q-26 128 -21 152" strokeWidth="3"/>
    </g>
    {stage === 0 ? <g>
      <ellipse cx="400" cy="443" rx="13" ry="18" transform="rotate(-24 400 443)" fill="#795331" stroke="#c69b64" strokeWidth="2"/>
      <path d="M397 431 Q406 443 402 455" stroke="#dfbd82" fill="none" strokeWidth="1.5"/>
      {progress > 30 && <path d="M402 431 Q400 419 409 415" stroke="#6f8b4f" strokeWidth="3" fill="none"/>}
    </g> : stage === 1 ? <g className="garden-growing-part" style={{ transform: `translate(400px, 440px) scale(${1 + progress * .008})` }}><path d="M0 2 Q-7 -30 1 -64" fill="none" stroke="#6b814b" strokeWidth="4"/><Leaf x={-2} y={-29} angle={-44} size={.75}/><Leaf x={0} y={-44} angle={85} size={.85} color="#8ba15b"/><Leaf x={1} y={-63} angle={23} size={.5} color="#9aaa63"/></g> : <g className="garden-growing-part" style={{ transform: `translate(400px, 440px) scale(${size})` }}>
      <path d="M-42 5 Q-12 -22 -14 -81 L-11 -177 Q-16 -232 -5 -289 L8 -292 Q5 -229 15 -178 L18 -80 Q22 -30 49 6 Q15 -5 4 -18 Q-7 -3 -42 5Z" fill={`url(#${id})`}/>
      <g fill="none" stroke={`url(#${id})`} strokeLinecap="round">
        <path d="M0 -159 Q-39 -219 -98 -240 T-160 -298 M5 -188 Q48 -221 92 -263 T159 -292 M-2 -225 Q-34 -269 -42 -323 M5 -250 Q28 -290 56 -335" strokeWidth="12"/>
        <path d="M-75 -231 Q-80 -269 -106 -295 M-109 -246 L-159 -257 M72 -247 Q80 -286 67 -311 M110 -275 Q141 -259 182 -274 M-27 -282 L-75 -314" strokeWidth="5"/>
      </g>
      {stage >= 3 && Array.from({ length: 58 }, (_, i) => {
        const angle = i * 2.39996;
        const radius = Math.sqrt((i + .5) / 58);
        const x = Math.cos(angle) * radius * 183;
        const y = -287 + Math.sin(angle) * radius * 74;
        return <g key={i} transform={`translate(${x} ${y})`}>
          <path d="M-31 10 Q-48 -5 -28 -20 Q-24 -39 -5 -29 Q13 -45 26 -25 Q49 -22 39 -4 Q49 18 24 23 Q1 37 -13 22 Q-38 32 -31 10Z" fill={['#335b42','#426b47','#577c4c','#6d8b51','#839959'][i % 5]}/>
          <Leaf x={8} y={10} angle={-30 + i % 60} size={.52} color={['#789856','#94a969','#597e49'][i % 3]}/>
        </g>;
      })}
      {stage < 3 && <>
        <Leaf x={-90} y={-240} angle={-47} size={1.55}/><Leaf x={86} y={-260} angle={85} size={1.6} color="#789650"/>
        <Leaf x={-8} y={-280} angle={-18} size={1.4} color="#8ca558"/><Leaf x={52} y={-326} angle={66} size={1.25}/>
        <Leaf x={-150} y={-290} angle={-45} size={1.25} color="#698b4e"/>
        {stage === 2 && <><Leaf x={-41} y={-320} angle={-45} size={1.5}/><Leaf x={150} y={-286} angle={90} size={1.4}/></>}
      </>}
      <path d="M-3 -171 Q-7 -96 2 -32 M7 -147 Q6 -60 22 -15" fill="none" stroke="#bcac83" strokeWidth="2" opacity=".55"/>
    </g>}
  </>;
}

/**
 * Cena principal do santuário. O botão planta (sem árvore ou árvore completa) ou rega (árvore crescendo).
 * `onPlant`/`onWater` devolvem a resposta da API, ou null se falharem.
 */
export default function TreeDisplay({ user, busy, onPlant, onWater }) {
  const id = useId().replace(/:/g, '');
  const reducedMotion = useReducedMotion();
  const lock = useRef(false);
  const [seedFlight, setSeedFlight] = useState(null);
  const [absorbed, setAbsorbed] = useState(null);

  const { tree_stage: stage, stage_progress: progress, next_stage_day: nextDay, growth_days: growthDays, is_growing: growing, can_water: canWater, seeds } = user;
  const planted = Boolean(user.planted_at);
  const disabled = busy || (growing ? !canWater : seeds < 1);

  async function handleClick() {
    if (lock.current || disabled) return;
    lock.current = true;
    const token = Date.now();
    setSeedFlight({ token, color: growing ? '#77b9d9' : '#aa713d' });
    try {
      const result = await (growing ? onWater() : onPlant());
      if (result) setAbsorbed({ token, label: growing ? '+1 dia de cuidado' : 'Semente plantada' });
    } finally {
      lock.current = false;
    }
  }

  const buttonLabel = busy ? 'Cuidando…'
    : !planted ? 'Abrir saco e plantar'
    : !growing ? 'Plantar próxima árvore'
    : canWater ? '💧 Regar hoje'
    : '✓ Regada hoje';
  const hint = !planted ? (seeds > 0 ? `1 semente para começar · ${seeds} disponíveis` : 'Sua semente inicial já foi utilizada.')
    : !growing ? 'Sua árvore está na floresta. Uma nova semente espera por você.'
    : 'Regue uma vez por dia. Use os insumos das missões para cuidar.';

  return <div className="living-sanctuary">
    <header className="garden-heading">
      <div>
        <span className="garden-eyebrow">SEU PEQUENO GESTO. UMA FLORESTA INTEIRA.</span>
        <h1>{user.tree_name}</h1>
        <p>Um pouco de cuidado, todos os dias.</p>
      </div>
      <div className="garden-progress">
        <div><span>ESTÁGIO 0{stage + 1}</span><strong>{STAGES[stage]}</strong></div>
        <div className="garden-progress-track" role="progressbar" aria-label="Crescimento para o próximo estágio" aria-valuenow={progress} aria-valuemin={0} aria-valuemax={100}>
          <span style={{ width: progress + '%' }}/>
        </div>
        <p>{nextDay
          ? <><strong>{growthDays}</strong> / {CARE_DAYS} dias de cuidado <span>Próximo: dia {nextDay}</span></>
          : <><strong>{CARE_DAYS} / {CARE_DAYS} dias</strong><span>Jornada completa</span></>}</p>
      </div>
    </header>

    <div className="garden-landscape">
      <div className="garden-sun" aria-hidden="true"/>
      <div className="garden-hill hill-back" aria-hidden="true"/><div className="garden-hill hill-front" aria-hidden="true"/>
      <div className="garden-soil" aria-hidden="true"/>
      <div className="garden-field-note">
        <span>CEIBA PENTANDRA</span>
        <p>{stage === 0 ? 'A vida começa\nabaixo da superfície.' : 'Crescer também é\naprofundar raízes.'}</p>
        <i>Uma sumaúma em formação</i>
      </div>
      <svg viewBox="0 0 800 640" className="garden-tree" role="img" aria-label={`Sumaúma no estágio ${STAGES[stage]}, com raízes visíveis no subsolo`}>
        <ellipse cx="400" cy="441" rx={stage ? 70 : 32} ry="6" fill="#302c1c" opacity=".2"/>
        <motion.g key={stage} initial={reducedMotion ? false : { opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: .9 }}>
          <g className="garden-breathe"><BotanicalTree stage={stage} progress={progress} id={id}/></g>
        </motion.g>
        {Array.from({ length: 27 }, (_, i) => <path key={i} d={`M${55 + i * 27} 442 q-3 -${4 + i % 7} -7 -${6 + i % 8} m7 ${6 + i % 8} q3 -8 6 -10`} fill="none" stroke={i % 2 ? '#73804d' : '#909465'} strokeWidth="1.3"/>)}
        {seedFlight && <motion.g key={seedFlight.token} initial={{ x: 490, y: 350, opacity: 1 }} animate={{ x: 400, y: 443, opacity: [1, 1, 0] }} transition={{ duration: reducedMotion ? 0 : .65, ease: 'easeIn' }} onAnimationComplete={() => setSeedFlight(v => v?.token === seedFlight.token ? null : v)}>
          <ellipse rx="7" ry="10" fill={seedFlight.color} stroke="#e4eac8" strokeWidth="2"/>
        </motion.g>}
        {absorbed && <motion.g key={absorbed.token} initial={{ opacity: 0 }} animate={{ opacity: [0, 1, 0] }} transition={{ duration: reducedMotion ? .1 : 1.5, delay: reducedMotion ? 0 : .45 }}>
          <motion.ellipse cx="400" cy="443" rx="40" ry="12" fill="none" stroke="#d7de9a" strokeWidth="2" initial={{ scale: .4 }} animate={{ scale: 2.5 }} style={{ transformOrigin: '400px 443px' }} transition={{ duration: 1.4 }}/>
          <path d="M400 444 Q375 482 335 495 M400 444 Q425 483 470 499 M400 444 Q395 489 401 532" fill="none" stroke="#ead79e" strokeWidth="2"/>
          <motion.text x="400" y="407" textAnchor="middle" fill="#49643b" fontSize="16" fontWeight="700" initial={{ y: 0 }} animate={{ y: -35 }} transition={{ duration: 1.4 }}>{absorbed.label}</motion.text>
        </motion.g>}
      </svg>
      <div className="garden-soil-caption"><span>01 / ACIMA, O QUE FLORESCE</span><span>02 / ABAIXO, O QUE SUSTENTA</span></div>
      <div className="garden-seed-action">
        <button onClick={handleClick} disabled={disabled} className="garden-plant-button">
          <span aria-hidden="true">🌰</span>{buttonLabel}
        </button>
        <p aria-live="polite">{hint}</p>
      </div>
    </div>

    <footer className="garden-earth-footer">
      <div className="garden-story">
        <span className="garden-story-mark" aria-hidden="true">❋</span>
        <div><span>O TEMPO DA NATUREZA</span><p>{NOTES[stage]}</p></div>
      </div>
      <ol className="garden-stages" aria-label="Estágios de crescimento">
        {STAGES.map((name, i) => <li key={name} className={i === stage ? 'is-current' : i < stage ? 'is-grown' : ''} aria-current={i === stage ? 'step' : undefined}>
          <span>{i < stage ? '✓' : String(i + 1).padStart(2, '0')}</span>{name}
        </li>)}
      </ol>
    </footer>
  </div>;
}
