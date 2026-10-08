/**
 * Normaliza texto livre digitado pelo jogador (nome de guardião, nome da árvore):
 * forma Unicode única (NFC), espaços colapsados e sem caracteres de controle ou invisíveis
 * (ex.: zero-width e inversores de direção de texto, usados para disfarçar nomes).
 */
module.exports = function cleanText(value) {
  return (typeof value === 'string' ? value : '')
    .normalize('NFC')
    .replace(/\s+/g, ' ')
    .replace(/[\p{Cc}\p{Cf}]/gu, '')
    .trim();
};
