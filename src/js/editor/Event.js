import JSLog from '../JSLog'
import $ from 'jquery'
import * as util from './util'
import storeERD from '@/store/editor/erd'

/**
 * 이벤트 클래스
 */
class Event {
  constructor () {
    JSLog('module loaded', 'Event')

    this.core = null
    this.rightClickListener = []
    this.components = {
      QuickMenu: null
    }

    this.isCursor = false
    this.isDraw = false
    this.lineId = null
    this.cursor = null

    this.isDrag = false
    this.tableIds = []
    this.move = {
      x: 0,
      y: 0
    }

    this.setEvent()
  }

  // 종속성 초기화
  init (core) {
    JSLog('module dependency init', 'Event')
    this.core = core
  }

  setEvent () {
    // 페이지 이동시 경고창
    // window.onbeforeunload = e => {
    //   const dialogText = 'Dialog text here';
    //   e.returnValue = dialogText;
    //   return dialogText;
    // }
    // 전역 이벤트
    this.on('contextmenu', e => {
      // 오른쪽 클릭 이벤트
      JSLog('event', 'contextmenu')
      e.preventDefault()
      this.core.event.onRightClick(e)
    }).on('mousemove', e => {
      if (this.move.x === 0 && this.move.y === 0) {
        this.move.x = e.clientX + document.documentElement.scrollLeft
        this.move.y = e.clientY + document.documentElement.scrollTop
      }
      // 관계 draw
      if (this.isDraw) {
        storeERD.commit({
          type: 'lineDraw',
          id: this.lineId,
          x: e.clientX + document.documentElement.scrollLeft,
          y: e.clientY + document.documentElement.scrollTop
        })
      }

      // 테이블 draggable
      const x = e.clientX + document.documentElement.scrollLeft - this.move.x
      const y = e.clientY + document.documentElement.scrollTop - this.move.y
      if (this.isDrag) {
        this.tableIds.forEach(tableId => {
          storeERD.commit({
            type: 'tableDraggable',
            id: tableId,
            x: x,
            y: y
          })
        })
      }

      this.move.x = e.clientX + document.documentElement.scrollLeft
      this.move.y = e.clientY + document.documentElement.scrollTop
    }).on('mousedown', e => {
      JSLog('event', 'mousedown')
      // 테이블 메뉴 hide
      if (!$(e.target).closest('#quick_menu').length) {
        this.components.QuickMenu.isShow = false
      }
      // 데이터 타입 힌트 hide
      if (!$(e.target).closest('.erd_data_type_list').length) {
        storeERD.commit({
          type: 'columnDataTypeHintVisibleAll',
          isDataTypeHint: false
        })
      }
      // 테이블 및 컬럼 selected 해제
      if (!$(e.target).closest('.erd_table').length) {
        util.selectedNone(true, true)
      }
    }).on('mouseup', e => {
      JSLog('event', 'mouseup')
      this.onDraggable('stop')
    }).on('keydown', e => {
      JSLog('event', 'keydown', e.keyCode)
      switch (e.keyCode) {
        case 13: // key: Enter
          if (e.altKey) {
            // 컬럼 생성
            for (let table of storeERD.state.tables) {
              if (table.ui.selected) {
                storeERD.commit({
                  type: 'columnAdd',
                  id: table.id
                })
              }
            }
          }
          break
        case 75: // key: K
          if (e.altKey) {
            // 컬럼 PK 부여
            storeERD.commit({
              type: 'columnKey',
              key: 'pk'
            })
          }
          break
        case 84: // key: T
          if (e.altKey) {
            // 테이블 생성
            storeERD.commit({ type: 'tableAdd' })
          }
          break
        case 49: // key: 1
          if (e.altKey) {
            // 관계 1:1
            if (this.isCursor) {
              this.onCursor('stop')
            } else {
              this.onCursor('start', 'erd-0-1')
            }
          }
          break
        case 50: // key: 2
          if (e.altKey) {
            // 관계 1:N
            if (this.isCursor) {
              this.onCursor('stop')
            } else {
              this.onCursor('start', 'erd-0-1-N')
            }
          }
          break
      }
    }).on('keyup', e => {
      JSLog('event', 'keyup', e.keyCode)
    })
  }

  // 전역 이벤트 연결
  on (type, fn) {
    window.addEventListener(type, fn)
    return this
  }

  // 오른쪽 클릭 이벤트 추가
  addRightClick (fn, id) {
    this.rightClickListener.push({
      fn: fn,
      id: id
    })
  }

  // 오른쪽 클릭 이벤트 삭제
  removeRightClick (id) {
    for (let i in this.rightClickListener) {
      if (id === this.rightClickListener[i].id) {
        this.rightClickListener.splice(i, 1)
        break
      }
    }
  }

  // 오른쪽 클릭 이벤트 실행
  onRightClick (e) {
    this.rightClickListener.forEach(v => {
      if (typeof v.fn === 'function') v.fn(e)
    })
  }

  // 전역 커서 설정
  onCursor (type, cursor) {
    switch (type) {
      case 'start':
        document.querySelector('body').setAttribute('style', `cursor: url("/img/erd/${cursor}.png") 16 16, auto;`)
        this.isCursor = true
        this.cursor = cursor
        break
      case 'stop':
        document.querySelector('body').removeAttribute('style')
        this.isCursor = false
        this.cursor = null
        if (this.isDraw) {
          this.onDraw('stop')
        }
        break
    }
  }

  // 관계 draw
  onDraw (type, id) {
    switch (type) {
      case 'start':
        this.lineId = id
        this.isDraw = true
        break
      case 'stop':
        this.isDraw = false
        if (id) {
          const table = util.getData(storeERD.state.tables, id)

          // fk 컬럼 생성
          const startColumnIds = []
          const endColumnIds = []
          const line = util.getData(storeERD.state.lines, this.lineId)
          const columns = util.getPKColumns(line.points[0].id)
          columns.forEach(v => {
            const columnId = util.guid()
            startColumnIds.push(v.id)
            endColumnIds.push(columnId)
            storeERD.commit({
              type: 'columnAdd',
              id: id,
              isInit: true,
              column: {
                id: columnId,
                name: util.autoName(table.columns, v.name),
                comment: v.comment,
                dataType: v.dataType,
                options: {
                  notNull: true
                },
                ui: {
                  fk: true
                }
              }
            })
          })

          // line drawing
          storeERD.commit({
            type: 'lineDraw',
            id: this.lineId,
            x: table.ui.left,
            y: table.ui.top,
            tableId: id,
            startColumnIds: startColumnIds,
            endColumnIds: endColumnIds
          })

          this.onCursor('stop')
        } else {
          storeERD.commit({
            type: 'lineDelete',
            id: this.lineId
          })
        }
        this.lineId = null
        break
    }
  }

  // 드래그 이벤트
  onDraggable (type, ids) {
    switch (type) {
      case 'start':
        this.isDrag = true
        this.tableIds = ids
        break
      case 'stop':
        this.isDrag = false
        this.tableIds = []
        break
    }
  }
}

export default new Event()
