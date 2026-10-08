/**
 * Recompensas trocadas por moedas.
 * Cada uma é liberada quando a árvore do jogador alcança `required_stage` (users.highest_stage).
 * A `key` é gravada em reward_claims: nunca altere a key de uma recompensa existente.
 *
 * Por enquanto são conquistas simbólicas: o resgate só fica registrado na conta, nada é entregue
 * fora do app. Ao integrar uma entrega real (e-book, certificado, selo no perfil, doação), atualize
 * a descrição aqui junto com a integração.
 */
module.exports = [
  {
    key: 'guia-bioeconomia',
    icon: '📖',
    name: 'Estudante da Bioeconomia',
    description: 'Conquista simbólica para quem começou a estudar cooperativas indígenas e produtos da sociobiodiversidade.',
    coin_cost: 15,
    required_stage: 0,
  },
  {
    key: 'muda-nativa',
    icon: '🌱',
    name: 'Muda Nativa Simbólica',
    description: 'Uma muda simbólica em homenagem aos viveiros comunitários que recuperam a floresta no Baixo Amazonas.',
    coin_cost: 20,
    required_stage: 1,
  },
  {
    key: 'castanheira',
    icon: '🌰',
    name: 'Castanheira Simbólica',
    description: 'Uma castanheira simbólica em homenagem às áreas de regeneração florestal da Amazônia.',
    coin_cost: 60,
    required_stage: 3,
  },
  {
    key: 'selo-guardiao',
    icon: '🛡️',
    name: 'Selo Guardião da Floresta Viva',
    description: 'Selo simbólico que reconhece seu cuidado contínuo com a floresta.',
    coin_cost: 45,
    required_stage: 4,
  },
  {
    key: 'brigadistas',
    icon: '🔥',
    name: 'Homenagem aos Brigadistas',
    description: 'Reconhecimento simbólico ao trabalho dos brigadistas voluntários que protegem a floresta contra queimadas.',
    coin_cost: 90,
    required_stage: 5,
  },
];
