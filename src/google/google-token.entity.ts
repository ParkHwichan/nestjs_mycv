import { Entity, Column, PrimaryGeneratedColumn, OneToOne, JoinColumn, CreateDateColumn, UpdateDateColumn } from 'typeorm';
import { User } from '../users/users.entity';

@Entity()
export class GoogleToken {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  googleId: string;  // Google 사용자 ID

  @Column()
  email: string;

  @Column({ nullable: true })
  name: string;

  @Column({ nullable: true })
  picture: string;

  @Column('text')
  accessToken: string;

  @Column('text', { nullable: true })
  refreshToken: string;

  @Column('bigint')
  expiresAt: number;  // timestamp

  @Column('text')
  scope: string;

  @OneToOne(() => User, (user) => user.googleToken, { onDelete: 'CASCADE' })
  @JoinColumn()
  user: User;

  @Column()
  userId: number;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}

