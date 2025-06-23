# lyrs-musixmatch

**lyrs-musixmatch**는 커스텀이 편리한 가사 표시기 [Lyrs](https://github.com/organization/lyrs)를 위한 MusixMatch 지원 플러그인입니다.  
자동으로 곡 정보를 인식하고, 다양한 언어의 가사와 번역, 일본어 가사 한글 발음까지 지원합니다!

![lyrs-musixmatch 데모](https://github.com/user-attachments/assets/eaca64f2-83f2-4929-9f87-4e972c28f692)

---

## 주요 기능

- 🎵 **Shazam(Apple Music API) 기반 곡 인식**  
  재생 중인 곡의 ISRC를 자동으로 검색합니다.

- 🌐 **MusixMatch에서 가사 자동 불러오기**  
  인식된 곡의 가사를 MusixMatch에서 가져와 표시합니다.

- 💬 **다국어 번역 지원**  
  Lyrs에 설정된 언어와 일치하는 번역 가사가 있으면 2열로 표시합니다.

- 🈂️ **일본어 → 한글 발음 변환**  
  한국어로 설정된 경우, 원문 가사가 일본어라면 [Hangulize](https://github.com/hangulize/hangulize)를 통해 한글 발음을 추가로 제공합니다.

---

## 설치 방법

1. **필수 조건**
   - [Lyrs](https://github.com/organization/lyrs)가 먼저 설치되어 있어야 합니다.

2. **lyrs-musixmatch 설치**
   - [여기](https://github.com/Baw-Appie/lyrs-musixmatch/releases/latest)에서 플러그인을 다운로드 받고,
   Lyrs 설정에서 [파일에서 불러오기]를 눌러 설치하세요.

4. **Lyrs 설정 변경**
   - Lyrs의 [가사 제공자] 설정을 MusixMatch로 변경하세요.

---

## 사용법

1. Lyrs를 실행하면, 자동으로 재생 중인 곡을 인식합니다.
2. 가사가 자동으로 표시됩니다.
3. 설정한 언어와 일치하는 번역 가사가 있으면 2열로 보여줍니다.
4. 일본어 가사의 경우, 한국어 설정 시 한글 발음도 함께 표시됩니다.

---

## 기여하기

이 프로젝트는 오픈소스입니다!  
버그 제보, 기능 제안, PR 모두 환영합니다.

1. 이슈 등록 또는 PR 생성
2. 친절한 설명을 곁들여주시면 더욱 좋아요!

---

## 참고 자료

- [Lyrs 공식 저장소](https://github.com/organization/lyrs)
- [MusixMatch](https://www.musixmatch.com/)
- [Hangulize](https://github.com/hangulize/hangulize)
