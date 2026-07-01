import { UserRole } from '../users/user.schema';

export type JwtPayload = {
  sub: string;
  email: string;
  roles: UserRole[];
};

export type SerializedUser = {
  id: string;
  _id: string;
  email: string;
  name?: string;
  fullName?: string;
  phone?: string;
  profileImage?: string;
  avatar?: string;
  image?: string;
  roles: UserRole[];
  activeRole: UserRole;
  sellerId?: string;
};
