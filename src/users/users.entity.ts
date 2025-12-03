import { AfterInsert, AfterUpdate, AfterRemove, Entity, Column, PrimaryGeneratedColumn, OneToOne, OneToMany } from 'typeorm';
import { Exclude } from 'class-transformer';
import { GoogleToken } from '../google/google-token.entity';
import { MailAccount } from '../mail/entities/mail-account.entity';
import { OAuthIdentity } from 'src/auth/oauth_identities.entity';

@Entity()
export class User {
    @PrimaryGeneratedColumn()
    id: number;

    @Column({ unique: true })
    email: string;

    @OneToOne(() => OAuthIdentity, (oauthIdentity) => oauthIdentity.user)
    oauthIdentity?: OAuthIdentity;

    @Column({ nullable: true })
    @Exclude()
    password: string;  // OAuth 사용자는 password가 null

    @Column({ nullable: true })
    name: string;

    @Column({ nullable: true })
    picture: string;

    @Column({ default: 'local' })
    provider: string;  // 'local' | 'google'

    @Column({ nullable: true })
    googleId: string;

    @Column({ default: false })
    needsReauth: boolean;  // Google 재인증 필요 여부

    // ==================== 기존 (deprecated, 마이그레이션 후 삭제) ====================
    @OneToOne(() => GoogleToken, (token) => token.user)
    googleToken: GoogleToken;

    // ==================== 새로운 다중 메일 계정 ====================
    @OneToMany(() => MailAccount, (account) => account.user)
    mailAccounts: MailAccount[];

    @AfterInsert()
    logInsert() {
        console.log('[User] Created:', this.id, this.email);
    }

    @AfterUpdate()
    logUpdate() {
        console.log('[User] Updated:', this.id);
    }

    @AfterRemove()
    logRemove() {
        console.log('[User] Removed:', this.id);
    }
}
