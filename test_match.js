import { GameMatch } from './services/game/dist/match/GameMatch.js';

const match = new GameMatch(
  'test-match',
  'test-seed',
  (msg) => console.log('EMIT:', msg),
  (results) => console.log('RESULTS:', results)
);

console.log('--- Adding Player 1 ---');
match.addPlayer('player1', 'Alice');

console.log('--- Adding Player 2 ---');
match.addPlayer('player2', 'Bob');

