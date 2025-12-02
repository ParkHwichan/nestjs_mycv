import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { OpenaiService } from './openai.service';

describe('OpenaiService', () => {
  let service: OpenaiService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        OpenaiService,
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn().mockReturnValue('test-api-key'),
          },
        },
      ],
    }).compile();

    service = module.get<OpenaiService>(OpenaiService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  // 실제 API 호출 테스트는 e2e 테스트에서 진행
  // 유닛 테스트에서는 OpenAI 클라이언트를 mock해야 함
  describe('analyzePaymentEmail', () => {
    it('should be a function', () => {
      expect(typeof service.analyzePaymentEmail).toBe('function');
    });
  });

  describe('summarizeEmail', () => {
    it('should be a function', () => {
      expect(typeof service.summarizeEmail).toBe('function');
    });
  });
});
