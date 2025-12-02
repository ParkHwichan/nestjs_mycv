import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import OpenAI from 'openai';

export interface PaymentInfo {
  isPayment: boolean; // 결제 관련 이메일인지
  amount?: number; // 결제 금액
  currency?: string; // 통화 (KRW, USD, EUR 등)
  merchant?: string; // 결제처
  paymentDate?: string; // 결제일 (ISO 문자열)
  cardType?: string; // 카드 종류
  paymentType?: string; // 결제 유형
  summary?: string; // 요약
}

export interface FileData {
  type: 'base64' | 'url';
  data: string; // base64 데이터 또는 URL
  mimeType: string; // image/png, image/jpeg, application/pdf 등
  filename?: string; // 파일명
}

@Injectable()
export class OpenaiService {
  private openai: OpenAI;

  constructor(private configService: ConfigService) {
    this.openai = new OpenAI({
      apiKey: this.configService.get<string>('OPENAI_API_KEY'),
    });
  }

  /**
   * 이메일이 결제 관련인지 분석하고 정보 추출 (Vision API - 이미지/PDF 포함)
   */
  async analyzePaymentEmail(email: {
    from: string;
    subject: string;
    body: string;
    htmlBody?: string;
    files?: FileData[]; // 이미지 + PDF 파일들
  }): Promise<PaymentInfo> {
    const systemPrompt = `당신은 이메일 분석 전문가입니다. 결제/구매/청구 관련 이메일을 정확히 식별하고 정보를 추출합니다.
이메일 본문, 첨부된 이미지(영수증, 결제 내역 스크린샷), PDF 파일(청구서, 영수증)을 모두 분석해서 결제 정보를 추출하세요.
반드시 유효한 JSON 형식으로만 응답하세요.`;

    const textPrompt = `다음 이메일을 분석해서 결제/구매/청구 관련 이메일인지 판단하고, 결제 정보를 추출해주세요.
텍스트 본문, 이미지(영수증, 결제 내역), PDF 파일(청구서, 영수증)을 모두 확인하세요.

발신자: ${email.from}
제목: ${email.subject}

텍스트 본문:
${email.body?.substring(0, 3000) || '(본문 없음)'}

${email.htmlBody ? `HTML 본문 (일부):
${this.extractTextFromHtml(email.htmlBody).substring(0, 2000)}` : ''}

다음 JSON 형식으로 응답해주세요:
{
  "isPayment": true/false,  // 결제/구매/청구 관련 이메일인지
  "amount": 숫자 또는 null,  // 결제 금액 (숫자만, 통화 기호 제외)
  "currency": "KRW/USD/EUR/JPY 등 또는 null",  // 통화 코드 (ISO 4217)
  "merchant": "문자열 또는 null",  // 결제처/가맹점/서비스명
  "paymentDate": "YYYY-MM-DD 또는 null",  // 결제일
  "cardType": "문자열 또는 null",  // 카드 종류 (예: 신한카드, 삼성카드)
  "paymentType": "문자열 또는 null",  // 결제 유형 (온라인결제, 오프라인결제, 구독, 이체 등)
  "summary": "문자열"  // 핵심 내용 2-3문장 요약
}

결제 관련이 아닌 경우에도 isPayment: false와 summary는 반드시 포함해주세요.
이미지나 PDF에서 발견한 결제 정보도 반드시 포함하세요.`;

    try {
      // 메시지 content 배열 구성
      const content: OpenAI.Chat.Completions.ChatCompletionContentPart[] = [
        { type: 'text', text: textPrompt },
      ];

      // 파일 추가 (이미지 + PDF, 최대 5개)
      const files = email.files?.slice(0, 5) || [];
      let imageCount = 0;
      let pdfCount = 0;

      for (const file of files) {
        if (file.mimeType.startsWith('image/')) {
          // 이미지 파일
          const imageUrl = file.type === 'url' 
            ? file.data 
            : `data:${file.mimeType};base64,${file.data}`;
          
          content.push({
            type: 'image_url',
            image_url: {
              url: imageUrl,
              detail: 'low',
            },
          });
          imageCount++;
        } else if (file.mimeType === 'application/pdf' && file.type === 'base64') {
          // PDF 파일 (base64로 전달)
          content.push({
            type: 'file',
            file: {
              filename: file.filename || 'document.pdf',
              file_data: `data:application/pdf;base64,${file.data}`,
            },
          } as any); // OpenAI 타입에 아직 file이 없을 수 있음
          pdfCount++;
        }
      }

      const response = await this.openai.chat.completions.create({
        model: 'gpt-4o-mini', // Vision + PDF 지원 모델
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content },
        ],
        max_tokens: 1000,
        temperature: 0.1,
        response_format: { type: 'json_object' },
      });

      const responseContent = response.choices[0]?.message?.content;
      if (!responseContent) {
        return { isPayment: false, summary: '분석 실패' };
      }

      const result = JSON.parse(responseContent) as PaymentInfo;
      
      console.log(`[OpenAI] Analyzed with ${imageCount} images, ${pdfCount} PDFs`);
      
      return {
        isPayment: result.isPayment ?? false,
        amount: result.amount ?? undefined,
        currency: result.currency ?? undefined,
        merchant: result.merchant ?? undefined,
        paymentDate: result.paymentDate ?? undefined,
        cardType: result.cardType ?? undefined,
        paymentType: result.paymentType ?? undefined,
        summary: result.summary ?? '요약 없음',
      };
    } catch (error) {
      console.error('[OpenAI] 분석 실패:', error.message);
      throw new Error(`이메일 분석 실패: ${error.message}`);
    }
  }

  /**
   * HTML에서 텍스트만 추출 (간단한 버전)
   */
  private extractTextFromHtml(html: string): string {
    return html
      .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '') // style 태그 제거
      .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '') // script 태그 제거
      .replace(/<[^>]+>/g, ' ') // 모든 태그 제거
      .replace(/&nbsp;/g, ' ')
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/\s+/g, ' ') // 연속 공백 제거
      .trim();
  }

  /**
   * 단순 이메일 요약 (결제 분석 없이)
   */
  async summarizeEmail(email: {
    from: string;
    subject: string;
    body: string;
  }): Promise<string> {
    const prompt = `다음 이메일을 한국어로 간단히 요약해주세요. 핵심 내용만 3-4문장으로 정리해주세요.

발신자: ${email.from}
제목: ${email.subject}

본문:
${email.body?.substring(0, 3000) || '(본문 없음)'}`;

    try {
      const response = await this.openai.chat.completions.create({
        model: 'gpt-4o-mini',
        messages: [
          {
            role: 'system',
            content: '당신은 이메일 요약 전문가입니다. 핵심 내용을 간결하게 요약해주세요.',
          },
          {
            role: 'user',
            content: prompt,
          },
        ],
        max_tokens: 500,
        temperature: 0.3,
      });

      return response.choices[0]?.message?.content || '요약을 생성할 수 없습니다.';
    } catch (error) {
      console.error('[OpenAI] 요약 실패:', error.message);
      throw new Error(`이메일 요약 실패: ${error.message}`);
    }
  }
}
