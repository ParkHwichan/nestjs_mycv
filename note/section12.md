# Section 12: Jest 테스트 작성하기

## 1. Jest란?

Jest는 JavaScript/TypeScript 애플리케이션을 위한 테스트 프레임워크입니다.

### Jest의 기본 개념

- **`describe`**: 테스트 그룹을 정의하는 함수
- **`it`**: 개별 테스트 케이스를 정의하는 함수
- **`beforeEach`**: 각 테스트 전에 실행되는 설정 함수
- **`expect`**: 테스트 결과를 검증하는 함수

### NestJS에서 Jest

NestJS 프로젝트를 생성하면 Jest가 기본적으로 포함되어 있습니다.

```json
// package.json
{
  "devDependencies": {
    "jest": "^30.0.0",
    "@types/jest": "^30.0.0",
    "ts-jest": "^29.2.5"
  }
}
```

## 2. 기본 테스트 구조

### 기본 테스트 파일 구조

```typescript
import { Test, TestingModule } from '@nestjs/testing';
import { ServiceName } from './service.name';

describe('ServiceName', () => {
  let service: ServiceName;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [ServiceName],
    }).compile();

    service = module.get<ServiceName>(ServiceName);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
```

### 주요 함수 설명

- **`describe('그룹명', () => { ... })`**: 관련된 테스트들을 그룹화
- **`it('테스트 설명', () => { ... })`**: 개별 테스트 케이스 작성
- **`beforeEach(async () => { ... })`**: 각 테스트 전에 실행되는 초기화 코드
- **`expect(값).toBeDefined()`**: 값이 정의되어 있는지 확인
- **`expect(값).toEqual(기대값)`**: 값이 기대값과 같은지 확인
- **`expect(값).rejects.toThrow(에러타입)`**: 비동기 함수가 특정 에러를 던지는지 확인

## 3. 모킹 (Mocking)

테스트에서 외부 의존성을 가짜 객체로 대체하는 것을 모킹이라고 합니다.

### 서비스 모킹 예제

```typescript
let fakeUsersService: Partial<UsersService>;

beforeEach(async () => {
  fakeUsersService = {
    find: (email: string) => Promise.resolve([]),
    create: (email: string, password: string) => 
      Promise.resolve({ id: 1, email, password } as User),
  };

  const module = await Test.createTestingModule({
    providers: [
      AuthService,
      {
        provide: UsersService,
        useValue: fakeUsersService,
      },
    ],
  }).compile();

  service = module.get<AuthService>(AuthService);
});
```

### 모킹의 장점

- 실제 데이터베이스나 외부 서비스에 의존하지 않음
- 테스트 실행 속도가 빠름
- 테스트 환경을 완전히 제어 가능

## 4. AuthService 테스트 예제

### 전체 테스트 코드

```typescript
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
      find: (email: string) => {
        const filteredUsers = users.filter(user => user.email === email);
        return Promise.resolve(filteredUsers);
      },
      create: (email: string, password: string) => {
        const user = { 
          id: Math.floor(Math.random() * 1000000), 
          email, 
          password 
        } as User;
        users.push(user);
        return Promise.resolve(user);
      },
    };
  
    const module = await Test.createTestingModule({
      providers: [
        AuthService,
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
    await service.signup('test@test.com', '123456');
    await expect(service.signup('test@test.com', '123456'))
      .rejects.toThrow(BadRequestException);
  });

  it('throws an error if signin is called with an unused email', async () => {
    await expect(service.signin('test@test.com', '123456'))
      .rejects.toThrow(NotFoundException);
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
```

### 테스트 케이스 설명

1. **인스턴스 생성 테스트**: 서비스가 제대로 생성되는지 확인
2. **비밀번호 해싱 테스트**: `signup` 시 비밀번호가 해시되는지 확인
3. **중복 이메일 테스트**: 이미 사용 중인 이메일로 가입 시도 시 에러 발생 확인
4. **존재하지 않는 이메일 테스트**: 없는 이메일로 로그인 시도 시 에러 발생 확인
5. **잘못된 비밀번호 테스트**: 잘못된 비밀번호로 로그인 시도 시 에러 발생 확인

## 5. UsersController 테스트 예제

### 전체 테스트 코드

```typescript
import { Test, TestingModule } from '@nestjs/testing';
import { UsersController } from './users.controller';
import { UsersService } from './users.service';
import { AuthService } from './auth.service';
import { User } from './users.entity';
import { NotFoundException } from '@nestjs/common';

describe('UsersController', () => {
  let controller: UsersController;
  let fakeUsersService: Partial<UsersService>;
  let fakeAuthService: Partial<AuthService>;

  beforeEach(async () => {
    fakeUsersService = {
      findOne: (id: number) => Promise.resolve({
        id,
        email: 'test@test.com',
        password: 'testpassword',
      } as User),
      find: (email: string) => Promise.resolve([
        { id: 1, email, password: 'testpassword' } as User,
      ]),
    };
    
    fakeAuthService = {
      signin: () => Promise.resolve({ 
        id: 1, 
        email: 'test@test.com', 
        password: 'testpassword' 
      } as User),
      signup: () => Promise.resolve({ 
        id: 1, 
        email: 'test@test.com', 
        password: 'testpassword' 
      } as User),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [UsersController],
      providers: [
        {
          provide: UsersService,
          useValue: fakeUsersService,
        },
        {
          provide: AuthService,
          useValue: fakeAuthService,
        },
      ],
    }).compile();

    controller = module.get<UsersController>(UsersController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  it('findAllUsers returns a list of users with the given email', async () => {
    const users = await controller.findAllUsers('test@test.com');
    expect(users.length).toEqual(1);
    expect(users[0].email).toEqual('test@test.com');
  });

  it('findUser returns a single user with the given id', async () => {
    const user = await controller.findUser('1');
    expect(user).toBeDefined();
  });

  it('findUser throws an error if user with given id is not found', async () => {
    fakeUsersService.findOne = () => Promise.resolve(null);
    await expect(controller.findUser('1')).rejects.toThrow(NotFoundException);
  });

  it('signin updates session object and returns user', async () => {
    const session = { userId: -10 };
    const user = await controller.signin(
      { email: 'test@test.com', password: 'testpassword' }, 
      session
    );
    expect(session.userId).toEqual(1);
    expect(user.email).toEqual('test@test.com');
  });
});
```

### 컨트롤러 테스트 특징

- **컨트롤러와 서비스 모두 모킹**: 컨트롤러는 여러 서비스에 의존하므로 모두 모킹 필요
- **세션 객체 테스트**: `signin` 메서드가 세션 객체를 올바르게 수정하는지 확인
- **에러 처리 테스트**: 존재하지 않는 사용자 조회 시 에러 발생 확인

## 6. Jest 설정

### jest.config.js

```javascript
const path = require('path');

module.exports = {
  moduleFileExtensions: ['js', 'json', 'ts'],
  rootDir: '.',
  testRegex: 'src/.*\\.spec\\.ts$',
  preset: 'ts-jest',
  transform: {
    '^.+\\.(t|j)s$': [
      'ts-jest',
      {
        tsconfig: {
          baseUrl: '.',
        },
      },
    ],
  },
  moduleNameMapper: {
    '^src/(.*)$': '<rootDir>/src/$1',
  },
  collectCoverageFrom: ['src/**/*.(t|j)s'],
  coverageDirectory: 'coverage',
  testEnvironment: 'node',
};
```

### 주요 설정 설명

- **`rootDir`**: 테스트 파일의 루트 디렉토리
- **`testRegex`**: 테스트 파일 패턴 (`.spec.ts`로 끝나는 파일)
- **`preset`**: TypeScript를 위한 `ts-jest` 프리셋 사용
- **`moduleNameMapper`**: 절대 경로(`src/...`)를 상대 경로로 매핑
- **`testEnvironment`**: Node.js 환경에서 테스트 실행

### moduleNameMapper의 중요성

TypeScript에서 `src/`로 시작하는 절대 경로를 사용할 때, Jest가 이를 해석할 수 있도록 `moduleNameMapper`가 필요합니다.

```typescript
// 소스 코드에서
import { Serialize } from 'src/interceptors/serialize.interceptor';

// Jest가 이를 다음과 같이 해석
import { Serialize } from '<rootDir>/src/interceptors/serialize.interceptor';
```

## 7. 테스트 작성 시 주의사항

### 1. 해시된 비밀번호 테스트

비밀번호가 해시되어 저장되는 경우, 평문 비밀번호로 테스트하면 안 됩니다.

```typescript
// ❌ 잘못된 방법
fakeUsersService.find = () => Promise.resolve([
  { email: 'test@test.com', password: '123456' } as User
]);

// ✅ 올바른 방법
const user = await service.signup('test@test.com', 'correctpassword');
fakeUsersService.find = () => Promise.resolve([user]);
```

### 2. 모킹된 서비스의 상태 관리

각 테스트에서 모킹된 서비스의 동작을 변경할 수 있습니다.

```typescript
it('throws an error if user signs up with email that is in use', async () => {
  // 특정 테스트에서만 find 메서드 동작 변경
  fakeUsersService.find = () => Promise.resolve([
    { id: 1, email: 'test@test.com', password: '123456' } as User
  ]);
  await expect(service.signup('test@test.com', '123456'))
    .rejects.toThrow(BadRequestException);
});
```

### 3. 비동기 테스트

비동기 함수를 테스트할 때는 `async/await`를 사용하거나 `rejects.toThrow()`를 사용합니다.

```typescript
// 비동기 함수 테스트
it('creates a new user', async () => {
  const user = await service.signup('test@test.com', '123456');
  expect(user).toBeDefined();
});

// 에러 발생 테스트
it('throws an error', async () => {
  await expect(service.signin('test@test.com', 'wrong'))
    .rejects.toThrow(BadRequestException);
});
```

### 4. 모킹된 객체의 반환값

모킹된 서비스가 빈 객체를 반환하면 테스트가 실패할 수 있습니다.

```typescript
// ❌ 잘못된 방법
fakeAuthService = {
  signin: () => Promise.resolve({} as User), // id가 undefined
};

// ✅ 올바른 방법
fakeAuthService = {
  signin: () => Promise.resolve({ 
    id: 1, 
    email: 'test@test.com', 
    password: 'testpassword' 
  } as User),
};
```

## 8. 테스트 실행 명령어

```bash
# 모든 테스트 실행
npm test

# Watch 모드로 실행 (파일 변경 시 자동 재실행)
npm run test:watch

# 커버리지 리포트 생성
npm run test:cov

# 디버그 모드로 실행
npm run test:debug
```

## 9. 테스트 파일 명명 규칙

- 테스트 파일은 `.spec.ts` 확장자를 사용
- 예: `auth.service.spec.ts`, `users.controller.spec.ts`

## 10. 요약

1. **Jest는 NestJS에 기본 포함**되어 있어 별도 설치 불필요
2. **`describe`, `it`, `beforeEach`**로 테스트 구조화
3. **모킹**을 통해 외부 의존성 제거
4. **`moduleNameMapper`**로 절대 경로 해석 설정
5. **비동기 테스트**는 `async/await` 또는 `rejects.toThrow()` 사용
6. **해시된 값 테스트** 시 실제 해시 프로세스를 거쳐야 함
7. **모킹된 객체**는 실제 사용되는 모든 속성을 포함해야 함

