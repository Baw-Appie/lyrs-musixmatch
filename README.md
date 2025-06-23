# lyrs-musixmatch
커스텀이 편리한 가사 표시기, [Lyrs](https://github.com/organization/lyrs)의 MusixMatch 지원 플러그인

![CleanShot 2025-06-14 at 19 13 47](https://github.com/user-attachments/assets/eaca64f2-83f2-4929-9f87-4e972c28f692)

이 플러그인은 재생중인 곡을 Shazam(Apple Music API)을 사용하여 ISRC를 검색하고,  
MusixMatch에서 일치하는 가사를 가져옵니다.

만약 Lyrs에 설정된 언어와 일치하는 번역 가사가 존재하는 경우 해당 가사가 2열로 표시되며  
한국어로 설정된 상태에서 원문 가사가 일본어인 경우 [Hangulize](https://github.com/hangulize/hangulize)를 사용하여 가사 발음이 추가됩니다.