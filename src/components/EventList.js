import React from 'react'
import { Link } from 'gatsby'

const EventList = (props) => {
    const data = props.eventData
    console.log(data)
    {return(
    data.map((eventGroup,i) => (
        <>
        <div className="div-block"/>
        <h4>{eventGroup.title}</h4>
        {eventGroup.years.map((year,i) => (
            <>
            <div className="year-row">
              <div className="year-label">{year.formattedYear}</div>
              <div className="year-content">
                {year.events.map((event,i) => (
                  <>
                  <div>
                    <div>{event.title}</div>
                    {event.participants.length > 0 &&
                    <div>People: {event.participants.map((person,i) =>
                        <>
                        {i > 0 && ', '}
                        <Link key={i} to={'/person/' + person.slug}>{person.name}</Link>
                        </>
                      )}
                    </div>}
                    {event.placeOccurred.length > 0 &&
                    <div>Place(s): {event.placeOccurred.map((place,i) =>
                        <>
                        {i > 0 && ', '}
                        <Link key={i} to={'/place/' + place.slug}>{place.name}</Link>
                        </>
                      )}
                    </div>}
                    {event.verses.length > 0 &&
                    <div>Passages: 
                      <Link to={event.verses[0].osisRef.split('.')[0].toLowerCase() + '#' + event.verses[0].osisRef}>
                        {event.verses[0].title}-{event.verses[event.verses.length-1].osisRef.split('.')[2]}
                      </Link>
                    </div>
                    }
                  </div>
                  </>
                ))}
              </div>
            </div>
            </>
          ))}
        </>
        )
    )
    )}
}

export default EventList