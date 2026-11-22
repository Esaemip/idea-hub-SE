# A1 아이디어 카드 유사도 모델 선정

Idea Hub는 짧은 한국어 아이디어 카드를 의미에 따라 묶는다. A2에서 카드 임베딩을 생성할 1차 모델로 **jhgan/ko-sroberta-multitask**를 선정했다.

| 후보 | 선정 근거와 용도 |
|---|---|
| 키워드·문자열 유사도 | 단어가 겹치는 카드의 유사도를 계산하는 기존 방식으로, 모델 도입 효과를 비교하는 기준으로 사용한다. |
| jhgan/ko-sroberta-multitask | 한국어 문장 유사도를 지원한다. 표현이 달라도 같은 목적을 담은 카드끼리 비교하는 프로젝트 요구사항에 맞아 채택했다. |
| intfloat/multilingual-e5-small | 한국어와 영어가 섞인 카드까지 평가할 때 비교할 다국어 모델이다. |

## 검증 계획

‘마감 전에 푸시를 보내자’와 ‘제출 기한이 다가오면 알려주자’처럼 표현이 다른 유사 카드, ‘알림을 보내자’와 ‘알림을 끄자’처럼 단어가 겹쳐도 목적이 다른 카드를 포함한다. A3에서 코사인 유사도를 계산하고 A6에서 팀원이 같은 그룹 또는 다른 그룹으로 표시한 카드 쌍을 기준으로 정밀도와 재현율을 비교한다. 임계값 조정용 카드와 최종 평가용 카드는 분리한다.

현재 선정 근거는 공개 모델 설명과 과제 요구사항이다. 실제 팀 카드에서의 정확도는 A6에서 측정한다.

## 모델 카드

- [ko-sroberta-multitask](https://huggingface.co/jhgan/ko-sroberta-multitask)
- [multilingual-e5-small](https://huggingface.co/intfloat/multilingual-e5-small)
