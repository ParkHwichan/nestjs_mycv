import { Entity, Column, PrimaryGeneratedColumn ,
  OneToOne, JoinColumn
} from 'typeorm';
import { User } from 'src/users/users.entity';

@Entity('oauth_identities')
export class OAuthIdentity {
    @PrimaryGeneratedColumn()
    id: number;

    @Column()
    userId: number;

    @OneToOne(() => User, (user) => user.oauthIdentity)
    @JoinColumn({ name: 'userId' })
    user: User;

    @Column()
    provider: string;
    @Column()
    providerUserId: string; // sub, id 등
  
    @Column('text', { nullable: true })
    accessToken: string;
  
    @Column('text', { nullable: true })
    refreshToken: string;
  
    @Column('bigint', { nullable: true })
    expiresAt: number;
  }