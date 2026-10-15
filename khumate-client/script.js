// ================= 1. 탭 전환 기능 =================
function switchTab(tabName) {
  const tabs = ['matching', 'chatting', 'houserule'];
  
  tabs.forEach(t => {
    const btn = document.getElementById(`tab-${t}`);
    const content = document.getElementById(`content-${t}`);
    
    if (btn && content) {
      if (t === tabName) {
        btn.className = "flex-1 py-3 text-sm font-bold text-red-600 border-b-2 border-red-600 transition";
        content.classList.remove('hidden');
      } else {
        btn.className = "flex-1 py-3 text-sm font-semibold text-slate-400 hover:text-slate-600 transition";
        content.classList.add('hidden');
      }
    }
  });
}

// ================= 2. 모달(팝업창) 제어 기능 =================
function openFilterModal() {
  const modal = document.getElementById('filter-modal');
  if (modal) modal.classList.remove('hidden');
}
function closeFilterModal() {
  const modal = document.getElementById('filter-modal');
  if (modal) modal.classList.add('hidden');
}

function openProfileEdit() {
  const modal = document.getElementById('profile-modal');
  if (modal) modal.classList.remove('hidden');
}
function closeProfileEdit() {
  const modal = document.getElementById('profile-modal');
  if (modal) modal.classList.add('hidden');
}

// ================= 3. 카드 목록 및 로컬 데이터 관리 =================
function loadDummyCards() {
  const cardContainer = document.getElementById('card-list-container');
  if (!cardContainer) return;
  
  cardContainer.innerHTML = "";
  
  // 로컬 스토리지 데이터 불러오기 (없으면 더미 데이터 초기 설정)
  let posts = JSON.parse(localStorage.getItem('khumate_posts')) || [];
  
  if (posts.length === 0) {
    posts = [
      {
        gender: "남성",
        dormPeriod: "한 학기",
        dept: "전자공학과",
        studentId: "24학번",
        birthYear: "2005년생",
        title: "룸메이트 구해요"
      },
      {
        gender: "여성",
        dormPeriod: "연간(1년)",
        dept: "컴퓨터공학과",
        studentId: "23학번",
        birthYear: "2004년생",
        title: "조용하고 깔끔하신 분 맞춰봐요!"
      }
    ];
    localStorage.setItem('khumate_posts', JSON.stringify(posts));
  }
  
  // 요구사항 구조 적용:
  // 1단: 성별 / 거주기간 (붉은색 강조)
  // 2단: 게시글 제목 (크게)
  // 3단: 학과 / 학번 / 나이(출생년도)
  posts.forEach(post => {
    const card = document.createElement('div');
    card.className = "bg-white p-5 rounded-2xl border border-slate-200 shadow-sm hover:shadow-md transition space-y-2.5";
    card.innerHTML = `
      <!-- 1단: 성별 & 거주기간 (붉은색 강조 태그) -->
      <div class="flex items-center gap-1.5 text-xs font-bold">
        <span class="px-2.5 py-1 bg-red-100 text-red-600 rounded-md border border-red-200">${post.gender || "남성"}</span>
        <span class="px-2.5 py-1 bg-red-50 text-red-600 rounded-md border border-red-100">${post.dormPeriod || "한 학기"}</span>
      </div>

      <!-- 2단: 게시글 제목 (크게) -->
      <h3 class="font-black text-slate-800 text-lg leading-snug pt-0.5">${post.title || "룸메이트 구해요"}</h3>

      <!-- 3단: 학과 & 학번 & 나이(출생년도) -->
      <div class="flex flex-wrap items-center gap-1.5 text-xs font-medium text-slate-600 pt-1 border-t border-slate-100">
        <span class="px-2 py-0.5 bg-slate-100 rounded text-slate-700 font-semibold">${post.dept || "전자공학과"}</span>
        <span class="px-2 py-0.5 bg-slate-100 rounded text-slate-700">${post.studentId || "24학번"}</span>
        <span class="px-2 py-0.5 bg-slate-100 rounded text-slate-700">${post.birthYear || "2005년생"}</span>
      </div>
    `;
    cardContainer.appendChild(card);
  });
}

// 커스텀 게시 확인 모달 열기/닫기
function confirmPublish() {
  const modal = document.getElementById('confirm-modal');
  if (modal) modal.classList.remove('hidden');
}
function closeConfirmModal() {
  const modal = document.getElementById('confirm-modal');
  if (modal) modal.classList.add('hidden');
}

// 게시하기 최종 실행 (기존 게시글 덮어쓰기 처리)
function executePublish() {
  const postTitle = document.getElementById('post-title').value.trim() || "룸메이트 구해요";
  const deptInput = document.getElementById('dept-search').value.trim() || "전자공학과";
  const rawStudentId = document.getElementById('student-id').value.trim() || "24";
  const rawBirthYear = document.getElementById('user-birthyear').value.trim() || "2005";
  
  // 선택된 성별
  const selectedGender = document.querySelector('input[name="gender"]:checked');
  const genderVal = selectedGender ? selectedGender.value : "남성";

  // 선택된 거주 기간
  const selectedDorm = document.querySelector('input[name="dorm_period"]:checked');
  const dormVal = selectedDorm ? selectedDorm.value : "한 학기";

  const newPost = {
    gender: genderVal,
    dormPeriod: dormVal,
    dept: deptInput,
    studentId: rawStudentId.includes("학번") ? rawStudentId : `${rawStudentId}학번`,
    birthYear: rawBirthYear.includes("년생") ? rawBirthYear : `${rawBirthYear}년생`,
    title: postTitle
  };

  // 요구사항: 기존 게시글을 삭제하고 내 새 글로 대체
  let posts = [newPost];
  localStorage.setItem('khumate_posts', JSON.stringify(posts));

  // 모달 닫기 및 리스트 새로고침
  closeConfirmModal();
  closeProfileEdit();
  loadDummyCards();
}

// 데이터 초기화
function resetLocalStorageData() {
  if (confirm("저장된 모든 매칭 프로필 데이터를 초기화하시겠습니까?")) {
    localStorage.removeItem('khumate_posts');
    loadDummyCards();
  }
}

// ================= 4. 단과대 & 학과 검색 드롭다운 로직 =================
const colleges = ["공과대학", "소프트웨어융합대학", "경영대학", "예술디자인대학", "자유전공학부"];
const departmentsList = ["전자공학과", "컴퓨터공학과", "경영학과", "시각디자인학과", "환경조경디자인학과"];

function showCollegeList() {
  const list = document.getElementById('college-list');
  if (list) {
    list.classList.remove('hidden');
    renderList('college-list', colleges, 'college-search');
  }
}

function filterCollegeList() {
  const searchInput = document.getElementById('college-search');
  if (!searchInput) return;
  const keyword = searchInput.value.toLowerCase();
  const filtered = colleges.filter(item => item.toLowerCase().includes(keyword));
  renderList('college-list', filtered, 'college-search');
}

function showDeptList() {
  const list = document.getElementById('dept-list');
  if (list) {
    list.classList.remove('hidden');
    renderList('dept-list', departmentsList, 'dept-search');
  }
}

function filterDeptList() {
  const searchInput = document.getElementById('dept-search');
  if (!searchInput) return;
  const keyword = searchInput.value.toLowerCase();
  const filtered = departmentsList.filter(item => item.toLowerCase().includes(keyword));
  renderList('dept-list', filtered, 'dept-search');
}

function renderList(targetId, items, inputId) {
  const ul = document.getElementById(targetId);
  if (!ul) return;
  
  ul.innerHTML = "";
  if (items.length === 0) {
    ul.innerHTML = `<li class="p-2 text-slate-400 text-center">검색 결과가 없습니다</li>`;
    return;
  }
  items.forEach(item => {
    const li = document.createElement('li');
    li.textContent = item;
    li.className = "p-2 hover:bg-red-50 hover:text-red-600 cursor-pointer border-b border-slate-100 last:border-none";
    li.onclick = () => {
      document.getElementById(inputId).value = item;
      ul.classList.add('hidden');
    };
    ul.appendChild(li);
  });
}

// ================= 5. 취침/기상 시간(시) 커스텀 드롭다운 로직 =================
const hoursList = Array.from({length: 24}, (_, i) => String(i).padStart(2, '0'));

function toggleHourDropdown(targetId) {
  ['sleep-hour-list', 'wake-hour-list'].forEach(id => {
    if (id !== targetId + '-list') {
      document.getElementById(id)?.classList.add('hidden');
    }
  });

  const listId = targetId + '-list';
  const ul = document.getElementById(listId);
  if (!ul) return;

  const isHidden = ul.classList.contains('hidden');
  if (isHidden) {
    ul.classList.remove('hidden');
    renderHourList(listId, hoursList, targetId);
  } else {
    ul.classList.add('hidden');
  }
}

function renderHourList(targetId, items, inputId) {
  const ul = document.getElementById(targetId);
  if (!ul) return;
  
  ul.innerHTML = "";
  items.forEach(item => {
    const li = document.createElement('li');
    li.textContent = item;
    li.className = "p-2 hover:bg-red-50 hover:text-red-600 cursor-pointer border-b border-slate-100 last:border-none text-center font-medium";
    li.onclick = () => {
      document.getElementById(inputId).value = item;
      ul.classList.add('hidden');
    };
    ul.appendChild(li);
  });
}

// ================= 6. 라디오 박스 전체 강조 제어 =================
function updateAllRadioBoxes() {
  document.querySelectorAll('input[type="radio"]').forEach(radio => {
    const box = radio.closest('.radio-box');
    if (!box) return;
    
    if (radio.checked) {
      box.classList.remove('border-slate-300', 'bg-white');
      box.classList.add('border-red-500', 'bg-red-50/50', 'shadow-sm');
    } else {
      box.classList.remove('border-red-500', 'bg-red-50/50', 'shadow-sm');
      box.classList.add('border-slate-300', 'bg-white');
    }
  });
}

document.addEventListener('change', (e) => {
  if (e.target.type === 'radio') {
    updateAllRadioBoxes();
  }
});

// ================= 7. 외부 클릭 시 모든 드롭다운 닫기 =================
document.addEventListener('click', (e) => {
  if (!e.target.closest('#college-search') && !e.target.closest('#college-list')) {
    document.getElementById('college-list')?.classList.add('hidden');
  }
  if (!e.target.closest('#dept-search') && !e.target.closest('#dept-list')) {
    document.getElementById('dept-list')?.classList.add('hidden');
  }

  ['sleep-hour', 'wake-hour'].forEach(id => {
    if (!e.target.closest(`#${id}`) && !e.target.closest(`#${id}-list`)) {
      document.getElementById(`${id}-list`)?.classList.add('hidden');
    }
  });
});

// ================= 8. 페이지 로드 시 초기 실행 =================
window.onload = function() {
  loadDummyCards();
  updateAllRadioBoxes();
};