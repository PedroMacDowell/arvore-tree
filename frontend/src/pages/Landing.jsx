import { Link } from 'react-router-dom';
import '../styles/landing.css';

const STATS = [
  { value: '390 Bi', label: 'Árvores individuais em pé na Bacia Amazônica' },
  { value: '20 Bi', label: "Toneladas de vapor d'água bombeadas por dia (Rios Voadores)" },
  { value: '17%+', label: 'Desmatamento acumulado (Limite crítico: 20-25%)', tone: 'alert' },
  { value: '10%', label: 'Da biodiversidade conhecida de todo o planeta Terra', tone: 'highlight' },
];

const PILLARS = [
  {
    icon: '💧',
    title: 'Rios Voadores & Abastecimento do Brasil',
    text: 'Uma única sumaúma adulta bombeia até 1.000 litros de água para a atmosfera diariamente. Essa umidade viaja mil quilômetros e irriga as lavouras do Centro-Oeste e enche os reservatórios do Sudeste. Sem Amazônia, não há agronegócio viável nem energia hidrelétrica no Brasil.',
  },
  {
    icon: '⚠️',
    title: 'O Risco da Savanização Irreversível',
    text: 'Pesquisadores do INPE e cientistas do IPCC alertam: se o desmatamento atingir 20 a 25%, o ciclo hidrológico entra em colapso e a floresta não conseguirá se regenerar, virando uma savana degradada. Estamos perigosamente próximos desse limite.',
    tone: 'alert',
  },
  {
    icon: '🏹',
    title: 'Territórios Indígenas: Muralhas da Vida',
    text: 'Satélites mostram que terras demarcadas têm índices de desmatamento inferiores a 2%. Reconhecer e apoiar os povos da floresta é a estratégia climática mais econômica, justa e eficiente do mundo.',
  },
  {
    icon: '🌰',
    title: 'Sociobioeconomia da Floresta em Pé',
    text: 'Produtos como açaí, cacau nativo, castanha-do-pará e óleos essenciais movimentam bilhões de reais gerando renda para comunidades locais, superando o valor especulativo do gado e da grilagem predatória.',
  },
];

const STEPS = [
  { title: 'Crie sua Conta', text: 'Receba uma semente de Sumaúma pronta para plantar no seu santuário.' },
  { title: 'Cuide Todos os Dias', text: 'Regue uma vez por dia. Em 14 dias de cuidado, sua árvore passa por 6 estágios, da semente à Sumaúma ancestral.' },
  { title: 'Complete Missões Reais', text: 'Leituras e atividades sobre a Amazônia rendem moedas, fertilizante para o solo e proteção contra insetos.' },
  { title: 'Cultive sua Floresta', text: 'Árvores completas entram na sua floresta e liberam uma nova semente. Troque moedas por recompensas e convide amigos.' },
];

export default function Landing() {
  return (
    <div className="landing-page">
      <nav className="inst-nav">
        <div className="inst-nav-inner">
          <Link to="/" className="brand-logo">
            <span className="brand-icon">🌳</span>
            <div className="brand-text">
              <span className="brand-name">Árvore da Amazônia</span>
              <span className="brand-sub">Sumaúma & Preservação</span>
            </div>
          </Link>
          <div className="nav-actions">
            <Link to="/login" className="btn-nav-login">Acessar Minha Árvore</Link>
            <Link to="/login?tab=register" className="btn-nav-cta">Plantar Minha Semente</Link>
          </div>
        </div>
      </nav>

      <header className="inst-hero">
        <div className="hero-badge">
          <span>🌿 Movimento Coletivo de Conscientização Florestal</span>
        </div>
        <h1 className="hero-main-title">
          A Amazônia não precisa de discursos vazios. <br />
          Ela precisa de pessoas conectadas com a verdade.
        </h1>
        <p className="hero-description">
          A maior floresta tropical do planeta está a poucos passos do <em>ponto de não-retorno</em>.
          Criamos uma experiência interativa onde você cultiva uma Sumaúma virtual através de missões
          reais sobre biodiversidade, rios voadores e combate ao desmatamento.
        </p>
        <div className="hero-cta-group">
          <Link to="/login?tab=register" className="btn-primary-hero">Criar Minha Conta Gratuita e Começar</Link>
          <a href="#situacao" className="btn-outline-hero">Conhecer a Situação da Amazônia ↓</a>
        </div>
        <div className="forest-stats-grid">
          {STATS.map(stat => (
            <div key={stat.value} className={`stat-card ${stat.tone ?? ''}`}>
              <span className="stat-val">{stat.value}</span>
              <span className="stat-label">{stat.label}</span>
            </div>
          ))}
        </div>
      </header>

      <section id="situacao" className="inst-section">
        <div className="section-header">
          <span className="section-eyebrow">Diagnóstico Urgente</span>
          <h2 className="section-heading">O que está acontecendo com a nossa floresta?</h2>
          <p className="section-subtitle">
            Entender os mecanismos que sustentam o bioma é o primeiro passo para exigir ações eficazes.
          </p>
        </div>
        <div className="pillars-grid">
          {PILLARS.map(pillar => (
            <div key={pillar.title} className={`pillar-card ${pillar.tone ?? ''}`}>
              <div className="pillar-icon">{pillar.icon}</div>
              <h3 className="pillar-title">{pillar.title}</h3>
              <p className="pillar-text">{pillar.text}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="inst-section">
        <div className="section-header">
          <span className="section-eyebrow">A Experiência Interativa</span>
          <h2 className="section-heading">Como você faz a diferença aqui?</h2>
        </div>
        <div className="steps-flow">
          {STEPS.map((step, i) => (
            <div key={step.title} className="step-box">
              <div className="step-num">{i + 1}</div>
              <h4>{step.title}</h4>
              <p>{step.text}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="inst-banner-cta">
        <div className="banner-content">
          <h2>Pronto para ver sua árvore crescer no centro de tudo?</h2>
          <p>Cadastre-se agora em poucos segundos e comece sua jornada como guardião da Amazônia.</p>
          <Link to="/login?tab=register" className="btn-banner">Plantar Minha Sumaúma Agora</Link>
        </div>
      </section>

      <footer className="inst-footer">
        <div className="footer-inner">
          <div className="footer-left">
            <span>🌳 Árvore da Amazônia • Projeto Educacional & Conscientização Ambiental</span>
            <p>Fontes de dados: INPE (TerraBrasilis), MapBiomas, Imazon, Amazônia 2030 e Instituto Socioambiental (ISA).</p>
          </div>
          <div className="footer-links">
            <Link to="/login">Entrar</Link>
            <Link to="/login?tab=register">Criar Conta</Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
