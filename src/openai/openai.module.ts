import { Module } from '@nestjs/common';
import { OpenaiService } from './openai.service';

@Module({
  providers: [OpenaiService],
  exports: [OpenaiService], // 다른 모듈에서 사용 가능하도록 export
})
export class OpenaiModule {}
