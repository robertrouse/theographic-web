import React from 'react'
import { Link } from 'gatsby'

// Taken from https://stackoverflow.com/questions/14446511/most-efficient-method-to-groupby-on-a-array-of-objects?rq=1
const groupBy = function (xs, key) {
  return xs.reduce(function (rv, x) {
    (rv[x[key]] = rv[x[key]] || []).push(x)
    return rv
  }, {})
}

const EventList = (props) => {
  const data = props.eventData
  const yearKeys = data.map(event => { return {yearGroup: event.year[0].formattedYear, ...event}});
  const years = groupBy(yearKeys, `yearGroup`)

    return (
      Object.keys(years).map((year, i) => (
        <>
          <div className="div-block"/>
          <div className="year-row">
            <div className="year-label">{year}</div>
            <div className="year-content">
              {years[year].map((event, i) => (
                <>
                  <div className="event-label">{event.title}</div>
                  {event.verses.length > 0 &&
                    <div className="event-tags">
                      <span role="img" aria-label="passages">📖</span>&nbsp;
                      <Link to={event.verses[0].osisRef.split('.')[0].toLowerCase() + '#' + event.verses[0].osisRef}>
                        {event.verses[0].title}-
                        {(event.verses[0].osisRef.split('.')[1] !== event.verses[event.verses.length - 1].osisRef.split('.')[1]) &&
                          event.verses[event.verses.length - 1].osisRef.split('.')[1] + ":"
                        }
                        {event.verses[event.verses.length - 1].osisRef.split('.')[2]}
                      </Link>
                    </div>
                  }
                  {event.participants && event.participants.length > 0 &&
                    <div className="event-tags">
                      <span role="img" aria-label="people">👥</span>&nbsp;
                      {event.participants.map((person, i) =>
                      <>
                        {i > 0 && ', '}
                        <Link key={i} to={'/person/' + person.slug}>{person.name}</Link>
                      </>
                      )}
                    </div>
                  }
                  {event.placeOccurred && event.placeOccurred.length > 0 &&
                    <div className="event-tags">
                      <span role="img" aria-label="places">📍</span>&nbsp;
                      {event.placeOccurred.map((place, i) =>
                      <>
                        {i > 0 && ', '}
                        <Link key={i} to={'/place/' + place.slug}>{place.name}</Link>
                      </>
                    )}
                    </div>
                  }
                </>
              ))}
            </div>
          </div>
        </>
      )
    )
  )
}

export default EventList