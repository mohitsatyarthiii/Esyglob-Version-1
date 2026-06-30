import { JwtPayload } from './auth.types';

export type HeaderRequest = {
  header(name: string): string | undefined;
};

export type AuthenticatedRequest = HeaderRequest & {
  user: JwtPayload;
};

export type MaybeAuthenticatedRequest = HeaderRequest & {
  user?: JwtPayload;
};
