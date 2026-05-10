/* eslint-disable */
import { TypedDocumentNode as DocumentNode } from '@graphql-typed-document-node/core';
export type Maybe<T> = T | null;
export type InputMaybe<T> = Maybe<T>;
export type Exact<T extends { [key: string]: unknown }> = { [K in keyof T]: T[K] };
export type MakeOptional<T, K extends keyof T> = Omit<T, K> & { [SubKey in K]?: Maybe<T[SubKey]> };
export type MakeMaybe<T, K extends keyof T> = Omit<T, K> & { [SubKey in K]: Maybe<T[SubKey]> };
export type MakeEmpty<T extends { [key: string]: unknown }, K extends keyof T> = { [_ in K]?: never };
export type Incremental<T> = T | { [P in keyof T]?: P extends ' $fragmentName' | '__typename' ? T[P] : never };
/** All built-in and custom scalars, mapped to their actual values */
export type Scalars = {
  ID: { input: string; output: string; }
  String: { input: string; output: string; }
  Boolean: { input: boolean; output: boolean; }
  Int: { input: number; output: number; }
  Float: { input: number; output: number; }
};

export enum LeaderboardSort {
  BestScore = 'BEST_SCORE',
  TotalScore = 'TOTAL_SCORE',
  Wins = 'WINS'
}

export type Match = {
  __typename?: 'Match';
  durationSec: Scalars['Int']['output'];
  endReason: Scalars['String']['output'];
  endedAt: Scalars['String']['output'];
  id: Scalars['ID']['output'];
  playerA: MatchPlayer;
  playerB: MatchPlayer;
  startedAt: Scalars['String']['output'];
  winnerNick: Scalars['String']['output'];
};

export type MatchPlayer = {
  __typename?: 'MatchPlayer';
  nickname: Scalars['String']['output'];
  score: Scalars['Int']['output'];
  won: Scalars['Boolean']['output'];
};

export type PlayerStats = {
  __typename?: 'PlayerStats';
  bestScore: Scalars['Int']['output'];
  lastPlayedAt?: Maybe<Scalars['String']['output']>;
  matchesPlayed: Scalars['Int']['output'];
  matchesWon: Scalars['Int']['output'];
  nickname: Scalars['String']['output'];
  recentMatches: Array<Match>;
  totalScore: Scalars['Int']['output'];
  winRate: Scalars['Float']['output'];
};


export type PlayerStatsRecentMatchesArgs = {
  limit?: InputMaybe<Scalars['Int']['input']>;
};

export type Query = {
  __typename?: 'Query';
  leaderboard: Array<PlayerStats>;
  player?: Maybe<PlayerStats>;
  recentMatches: Array<Match>;
};


export type QueryLeaderboardArgs = {
  limit?: InputMaybe<Scalars['Int']['input']>;
  sortBy?: InputMaybe<LeaderboardSort>;
};


export type QueryPlayerArgs = {
  nickname: Scalars['String']['input'];
};


export type QueryRecentMatchesArgs = {
  limit?: InputMaybe<Scalars['Int']['input']>;
  nickname?: InputMaybe<Scalars['String']['input']>;
};

export type GetLeaderboardQueryVariables = Exact<{
  limit?: InputMaybe<Scalars['Int']['input']>;
  sortBy?: InputMaybe<LeaderboardSort>;
}>;


export type GetLeaderboardQuery = { __typename?: 'Query', leaderboard: Array<{ __typename?: 'PlayerStats', nickname: string, totalScore: number, matchesWon: number, winRate: number }> };

export type GetPlayerStatsQueryVariables = Exact<{
  nickname: Scalars['String']['input'];
}>;


export type GetPlayerStatsQuery = { __typename?: 'Query', player?: { __typename?: 'PlayerStats', nickname: string, matchesPlayed: number, matchesWon: number, winRate: number, totalScore: number, bestScore: number, recentMatches: Array<{ __typename?: 'Match', id: string, endedAt: string, winnerNick: string, playerA: { __typename?: 'MatchPlayer', nickname: string, score: number }, playerB: { __typename?: 'MatchPlayer', nickname: string, score: number } }> } | null };


export const GetLeaderboardDocument = {"kind":"Document","definitions":[{"kind":"OperationDefinition","operation":"query","name":{"kind":"Name","value":"GetLeaderboard"},"variableDefinitions":[{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"limit"}},"type":{"kind":"NamedType","name":{"kind":"Name","value":"Int"}}},{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"sortBy"}},"type":{"kind":"NamedType","name":{"kind":"Name","value":"LeaderboardSort"}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"leaderboard"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"limit"},"value":{"kind":"Variable","name":{"kind":"Name","value":"limit"}}},{"kind":"Argument","name":{"kind":"Name","value":"sortBy"},"value":{"kind":"Variable","name":{"kind":"Name","value":"sortBy"}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"nickname"}},{"kind":"Field","name":{"kind":"Name","value":"totalScore"}},{"kind":"Field","name":{"kind":"Name","value":"matchesWon"}},{"kind":"Field","name":{"kind":"Name","value":"winRate"}}]}}]}}]} as unknown as DocumentNode<GetLeaderboardQuery, GetLeaderboardQueryVariables>;
export const GetPlayerStatsDocument = {"kind":"Document","definitions":[{"kind":"OperationDefinition","operation":"query","name":{"kind":"Name","value":"GetPlayerStats"},"variableDefinitions":[{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"nickname"}},"type":{"kind":"NonNullType","type":{"kind":"NamedType","name":{"kind":"Name","value":"String"}}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"player"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"nickname"},"value":{"kind":"Variable","name":{"kind":"Name","value":"nickname"}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"nickname"}},{"kind":"Field","name":{"kind":"Name","value":"matchesPlayed"}},{"kind":"Field","name":{"kind":"Name","value":"matchesWon"}},{"kind":"Field","name":{"kind":"Name","value":"winRate"}},{"kind":"Field","name":{"kind":"Name","value":"totalScore"}},{"kind":"Field","name":{"kind":"Name","value":"bestScore"}},{"kind":"Field","name":{"kind":"Name","value":"recentMatches"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"limit"},"value":{"kind":"IntValue","value":"5"}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"endedAt"}},{"kind":"Field","name":{"kind":"Name","value":"winnerNick"}},{"kind":"Field","name":{"kind":"Name","value":"playerA"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"nickname"}},{"kind":"Field","name":{"kind":"Name","value":"score"}}]}},{"kind":"Field","name":{"kind":"Name","value":"playerB"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"nickname"}},{"kind":"Field","name":{"kind":"Name","value":"score"}}]}}]}}]}}]}}]} as unknown as DocumentNode<GetPlayerStatsQuery, GetPlayerStatsQueryVariables>;