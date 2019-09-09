import React from 'react'
import { graphql } from 'gatsby'
import { Helmet } from 'react-helmet'
import Markdown from 'react-markdown'
import MapGL, { Marker } from '@urbica/react-map-gl'
import '../components/layout.css'
import 'mapbox-gl/dist/mapbox-gl.css';
import EventList from '../components/EventList'

class Place extends React.Component {

  render () {
    const {data} = this.props
    const place = data.neo4j.Place[0]
    const MAPBOX_ACCESS_TOKEN = 'pk.eyJ1IjoiYmlibGV2aXoiLCJhIjoiY2pjOTVhazJ1MDlqbzMzczFoamd3MzFnOSJ9.7k1RJ5oh-LNaYuADxsgx4Q'
    const MAP_LAT = place.latitude
    const MAP_LNG = place.longitude

    return (
      <>
        <Helmet>
          <meta charSet="utf-8"/>
          <title>{place.name}</title>
          <meta content="{place.name}" property="og:title"/>
          <meta content="width=device-width, initial-scale=1" name="viewport"/>
        </Helmet>
        <div className="container">
          <h1 className="sticky-title">{place.name}</h1>
          <MapGL
            style={{ width: '100%', height: '400px' }}
            mapStyle='mapbox://styles/bibleviz/ck0cuh5fm06ws1cpmp54hvmtl'
            accessToken={MAPBOX_ACCESS_TOKEN}
            latitude={MAP_LAT}
            longitude={MAP_LNG}
            zoom={5}
          >
            <Marker longitude={MAP_LNG} latitude={MAP_LAT}>
              <div className="map-marker">{place.name}</div>
            </Marker>
          </MapGL>
          <Markdown source={place.description} />
          <div className="citation">M.G. Easton M.A., D.D., Illustrated Bible Dictionary, Third Edition</div>

          <div className="div-block"/>
          
          {data.neo4j.timeline.length > 0 && (
            <>
              <h3 className="heading-3">Timeline</h3>
              <EventList eventData = {data.neo4j.timeline}/>
            </>
            )
          }  
          <div className="footer"/>
        </div>
      </>
    )
  }
}

export default Place

export const pageQuery = graphql`
query ($lookupName: String!) {
  neo4j {
    Place(filter: {slug: $lookupName}) {
      name
      description
      latitude
      longitude
      hasBeenHere {
        name
        slug
      }
      verses {
        osisRef
        title
      }
    }
    timeline: Event(orderBy:sortKey_asc, filter: {placeOccurred_some: {slug: $lookupName}}) {
      title
      sequence
      sortKey
      year: yearsOccurred(orderBy: year_asc, first: 1) {
        formattedYear
      }
      eventGroup{
        title
      }
      verses(orderBy: verseId_asc) {
        verseId
        osisRef
        title
      }
      participants(orderBy: name_asc) {
        name
        slug
      }
    }
  }
}
`