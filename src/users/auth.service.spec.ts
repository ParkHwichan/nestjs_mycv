import { Test, TestingModule } from '@nestjs/testing';
import { AuthService } from './auth.service';
import { UsersService } from './users.service';
import { User } from './users.entity';
import { BadRequestException, NotFoundException } from '@nestjs/common';

describe('AuthService', () => {

    let service: AuthService;
    let fakeUsersService: Partial<UsersService>;
    
    beforeEach(async () => {    
        const users: User[] = [];
        fakeUsersService = {
            find: (email: string) =>  {
                const filteredUsers = users.filter(user => user.email === email);
                return Promise.resolve(filteredUsers);
            },
            create: (email: string, password: string) => {
                const user = { id: Math.floor(Math.random() * 1000000), email, password } as User;
                users.push(user);
                return Promise.resolve(user);
            },
        };
    
        const module = await Test.createTestingModule({
            providers: [AuthService, 
                {
                    provide: UsersService,
                    useValue: fakeUsersService,
                }
            ],
        }).compile();
    
        service = module.get<AuthService>(AuthService);
    });
    
    it('can create an instance of auth service', async () => {
        expect(service).toBeDefined();
    });

    it('creates a new user with a salted and hashed password', async () => {
        const user = await service.signup('test@test.com', '123456');
        expect(user.password).not.toEqual('123456');
        const [salt, hash] = user.password.split('.');
        expect(salt).toBeDefined();
        expect(hash).toBeDefined();
    });

    it('throws an error if user signs up with email that is in use', async () => {
        fakeUsersService.find = () => Promise.resolve([{ id: 1, email: 'test@test.com', password: '123456' } as User]);
        await expect(service.signup('test@test.com', '123456')).rejects.toThrow(BadRequestException);
    });

    it('throws an error if signin is called with an unused email', async () => {
        await expect(service.signin('test@test.com', '123456')).rejects.toThrow(NotFoundException);
    });

    it('throws if an invalid password is provided', async () => {
        // 먼저 올바른 비밀번호로 사용자를 생성 (해시된 비밀번호가 저장됨)
        await service.signup('test@test.com', 'correctpassword');

        // 잘못된 비밀번호로 로그인 시도
        await expect(
          service.signin('test@test.com', 'wrongPassword'),
        ).rejects.toThrow(BadRequestException);
    });
});