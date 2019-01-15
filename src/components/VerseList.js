import React from 'react'

// Taken from https://stackoverflow.com/questions/14446511/most-efficient-method-to-groupby-on-a-array-of-objects?rq=1
const groupBy = function (xs, key) {
    return xs.reduce(function (rv, x) {
      (rv[x[key]] = rv[x[key]] || []).push(x)
      return rv
    }, {})
  }

const BookList = (props)=> {
    console.log(props.verses)
    if(!props.verses) return <div></div>
    const verses = props.verses.map(v => {
      return {
        book: v.data.book[0].data.osisName,
        bookCannonicalOrder: v.data.book[0].data.bookOrder,
        chapter: v.data.chapter[0].data.chapterNum,
        verse: v.data.verseNum
      }
    })
    const groupedBooks = groupBy(verses, 'book')
    const sortedGroup = Object.keys(groupedBooks).sort((book1, book2) => book1.bookCannonicalOrder - book2.bookCannonicalOrder)
    return sortedGroup.map(book => {
      return <span key={book}>{book}<VerseList verses={groupedBooks[book]}/></span>
    })
  }

const VerseList = (props) => {
    console.log("trying verses")
    const listOfVerses = []
    let firstOfAdjacentVerses = null
    let numberOfAdjacentVerses = 0
    let firstVerse = true
    for (let verse of props.verses) {
      if (!firstOfAdjacentVerses) {
        firstOfAdjacentVerses = verse
        continue
      }
      if (verse.chapter === firstOfAdjacentVerses.chapter && Number.parseInt(firstOfAdjacentVerses.verse) + numberOfAdjacentVerses + 1 === Number.parseInt(verse.verse)) {
        numberOfAdjacentVerses++
      } else {
        const key = `${firstVerse ? ' ' : ', '}${firstOfAdjacentVerses.chapter}:${firstOfAdjacentVerses.verse}`
        if (numberOfAdjacentVerses) {
          listOfVerses.push(<a key={key}
                               href={`/verse/${firstOfAdjacentVerses.Osis_Ref}`}>
            {`${firstVerse ? ' ' : ', '}${verse.chapter}:${firstOfAdjacentVerses.verse}-${Number.parseInt(firstOfAdjacentVerses.verse) + numberOfAdjacentVerses}`}
          </a>)
          numberOfAdjacentVerses = 0
        }
        else {
          listOfVerses.push(<a key={key} href={`/verse/${firstOfAdjacentVerses.osisRef}`}>{key}</a>)
        }
        firstOfAdjacentVerses = verse
        firstVerse = false
      }
    }
    const key = `${firstVerse ? ' ' : ', '}${firstOfAdjacentVerses.chapter}:${firstOfAdjacentVerses.verse}`
    if (numberOfAdjacentVerses) {
      listOfVerses.push(<a key={key} href={`/verse/${firstOfAdjacentVerses.osisRef}`}>
        {`${firstVerse ? ' ' : ', '}${firstOfAdjacentVerses.chapter}:${firstOfAdjacentVerses.verse}-${Number.parseInt(firstOfAdjacentVerses.verse) + numberOfAdjacentVerses}`}
      </a>)
    }
    else {
      listOfVerses.push(<a key={key} href={`/verse/${firstOfAdjacentVerses.osisRef}`}>{key}</a>)
    }
    return listOfVerses
}

export default BookList