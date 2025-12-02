import { AfterInsert, AfterUpdate, AfterRemove, Entity, Column, PrimaryGeneratedColumn, OneToOne } from 'typeorm';
import { Exclude } from 'class-transformer';
import { GoogleToken } from '../google/google-token.entity';

@Entity()
export class User {
    @PrimaryGeneratedColumn()
    id: number;

    @Column({ unique: true })
    email: string;

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

    @OneToOne(() => GoogleToken, (token) => token.user)
    googleToken: GoogleToken;

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
